import logging
import os
import re
import time
from typing import List

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from deep_translator import GoogleTranslator, MyMemoryTranslator
from langdetect import DetectorFactory, detect
from google import genai
from google.genai import types
from pydantic import BaseModel

load_dotenv()
DetectorFactory.seed = 0  # make language detection deterministic

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("translator")

app = Flask(__name__)

MAX_CHARS = 500
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
_api_key = os.getenv("GEMINI_API_KEY")
GEMINI_TIMEOUT_MS = 20000  # a stalled model fails fast so we can try the next one
client = (
    genai.Client(api_key=_api_key, http_options=types.HttpOptions(timeout=GEMINI_TIMEOUT_MS))
    if _api_key
    else None
)

_active_model = GEMINI_MODEL
_candidates = None  # cached list of usable Gemini models, newest first


def _discover_models():
    """All 'gemini-X-flash' / 'gemini-X-flash-lite' models this key can call, newest first."""
    found = []
    for m in client.models.list():
        name = (m.name or "").removeprefix("models/")
        match = re.fullmatch(r"gemini-(\d+(?:\.\d+)*)-flash(-lite)?", name)
        actions = getattr(m, "supported_actions", None)
        if not match or (actions and "generateContent" not in actions):
            continue
        version = tuple(int(x) for x in match.group(1).split("."))
        found.append((version, match.group(2) is None, name))  # full flash before lite
    found.sort(reverse=True)
    return [name for _, _, name in found]


def _is_timeout(msg):
    low = msg.lower()
    return "timed out" in low or "timeout" in low or "deadline" in low


def _is_transient(msg):
    return _is_timeout(msg) or any(t in msg for t in ("503", "UNAVAILABLE", "500", "INTERNAL", "504"))


def _is_not_found(msg):
    return "NOT_FOUND" in msg or "404" in msg


def _config_for(config, low_thinking):
    """Ask Gemini 3 models to think briefly: this task is simple, and long thinking causes 504s."""
    if not low_thinking:
        return config
    config = config or types.GenerateContentConfig()
    return config.model_copy(
        update={"thinking_config": types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW)}
    )


def gemini_generate(contents, config, attempts_per_model=2, max_models=4):
    """generate_content that survives retired models, overload (503), slow responses and quota (429).

    Tries the current model (retrying brief overloads), then falls back to the other available
    Flash models. The first one that works becomes the active model.
    """
    global _active_model, _candidates
    tried, queue, failed_models = [], [_active_model], 0
    last_exc, low_thinking = None, True
    while queue and failed_models < max_models:
        model = queue.pop(0)
        if model in tried:
            continue
        tried.append(model)
        not_found, attempt = False, 0
        while attempt < attempts_per_model:
            attempt += 1
            try:
                response = client.models.generate_content(
                    model=model, contents=contents, config=_config_for(config, low_thinking)
                )
                if model != _active_model:
                    log.warning("Switched Gemini model: %s -> %s", _active_model, model)
                    _active_model = model
                return response
            except Exception as exc:
                last_exc, msg = exc, str(exc)
                log.warning("Gemini %s attempt %d failed: %s", model, attempt, msg[:200])
                if low_thinking and "thinking" in msg.lower() and ("400" in msg or "INVALID_ARGUMENT" in msg):
                    low_thinking = False  # this model family doesn't take thinking_level
                    attempt -= 1
                    continue
                if _is_not_found(msg):
                    not_found = True
                    break
                # Retry brief overloads on the same model; on a timeout move on instead.
                if _is_transient(msg) and not _is_timeout(msg) and attempt < attempts_per_model:
                    time.sleep(1.5 * attempt)
                    continue
                break  # quota, timeout, or retries used up: move to the next model
        if not not_found:
            failed_models += 1  # retired models don't count against the limit
        if not queue and failed_models < max_models:
            if _candidates is None:
                try:
                    _candidates = _discover_models()
                except Exception as exc:
                    log.warning("Could not list Gemini models: %s", str(exc)[:200])
                    _candidates = []
            queue = [m for m in _candidates if m not in tried]
    raise last_exc if last_exc else RuntimeError("no Gemini model available")


# ---------- Structured output schema for the AI breakdown ----------
class Component(BaseModel):
    text: str            # word or phrase from the German text
    role: str            # e.g. "subject", "direct object", "prepositional phrase"
    case_or_form: str    # e.g. "Nominative", "Dative", "Genitive", "Accusative", "n/a"
    explanation: str     # one or two sentences, why this case/form


class VerbNote(BaseModel):
    form: str            # verb as it appears
    infinitive: str
    conjugation: str     # person/number/tense, plus irregularities


class Breakdown(BaseModel):
    summary: str
    tense: str
    mood: str            # Indikativ / Konjunktiv I / Konjunktiv II / Imperativ
    sentence_structure: str  # word order notes (V2, subordinate clause, separable verbs...)
    components: List[Component]
    verbs: List[VerbNote]
    idioms_and_nuance: List[str]


class Link(BaseModel):
    source: List[int]    # indices of the original-sentence tokens (contiguous)
    target: List[int]    # indices of the translated-sentence tokens (contiguous)
    category: str        # noun, verb, pronoun, preposition, adjective, adverb, number, conjunction, other


class Alignment(BaseModel):
    links: List[Link]


LINK_CATEGORIES = {
    "noun", "verb", "pronoun", "preposition", "adjective", "adverb", "number", "conjunction", "other",
}
TOKEN_RE = re.compile(r"\w+(?:[-'\u2019]\w+)*|[^\w\s]", re.UNICODE)


def tokenize(text):
    """Split into words and punctuation marks."""
    return TOKEN_RE.findall(text)


def is_word(token):
    return any(ch.isalnum() for ch in token)


def clean_links(links, n_src, n_tgt, src_tokens, tgt_tokens):
    """Keep only structurally valid links: in range, contiguous, made of words, and not overlapping."""
    used_src, used_tgt, out = set(), set(), []
    for link in links:
        src, tgt = sorted(set(link.source)), sorted(set(link.target))
        if not src or not tgt:
            continue
        if src[0] < 0 or tgt[0] < 0 or src[-1] >= n_src or tgt[-1] >= n_tgt:
            continue
        if src != list(range(src[0], src[-1] + 1)) or tgt != list(range(tgt[0], tgt[-1] + 1)):
            continue  # a link must cover neighbouring words
        if not all(is_word(src_tokens[i]) for i in src) or not all(is_word(tgt_tokens[i]) for i in tgt):
            continue
        if used_src.intersection(src) or used_tgt.intersection(tgt):
            continue
        used_src.update(src)
        used_tgt.update(tgt)
        cat = (link.category or "other").strip().lower()
        out.append({"source": src, "target": tgt, "category": cat if cat in LINK_CATEGORIES else "other"})
    out.sort(key=lambda l: l["source"][0])
    return out


# ---------- Helpers ----------
def resolve_direction(text: str, mode: str):
    """Return (source, target) as 'en'/'de'."""
    if mode == "en-de":
        return "en", "de"
    if mode == "de-en":
        return "de", "en"
    try:
        return ("de", "en") if detect(text) == "de" else ("en", "de")
    except Exception:
        return "en", "de"


def error(msg, code=400):
    return jsonify({"error": msg}), code


MYMEMORY_CODES = {"en": "en-GB", "de": "de-DE"}


def _google(text, source, target):
    return GoogleTranslator(source=source, target=target).translate(text)


def _mymemory(text, source, target):
    return MyMemoryTranslator(
        source=MYMEMORY_CODES[source], target=MYMEMORY_CODES[target]
    ).translate(text)


def _gemini(text, source, target):
    if client is None:
        raise RuntimeError("GEMINI_API_KEY not configured")
    names = {"en": "English", "de": "German"}
    response = gemini_generate(
        contents=(
            f"Translate the following text from {names[source]} to {names[target]}. "
            f"Reply with ONLY the translation, nothing else.\n\n{text}"
        ),
        config=types.GenerateContentConfig(temperature=0.1),
    )
    out = (response.text or "").strip()
    if not out:
        raise RuntimeError("empty response from Gemini")
    return out


# Tried in order; the first one that works wins.
PROVIDERS = [("Google Translate", _google), ("MyMemory", _mymemory), ("Gemini", _gemini)]


def translate_text(text, source, target):
    """Return (translation, provider_name). Raises RuntimeError if all providers fail."""
    for name, fn in PROVIDERS:
        try:
            result = (fn(text, source, target) or "").strip()
            if result:
                return result, name
            log.warning("%s returned an empty translation", name)
        except Exception as exc:
            # Full details go to the server console so failures are diagnosable.
            log.warning("%s failed: %s: %s", name, type(exc).__name__, str(exc)[:300])
    raise RuntimeError("all translation providers failed")


# ---------- Routes ----------
@app.get("/")
def index():
    return render_template("index.html", max_chars=MAX_CHARS)


@app.post("/api/translate")
def api_translate():
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    mode = data.get("mode", "auto")

    if not text:
        return error("Please enter some text.")
    if len(text) > MAX_CHARS:
        return error(f"Text too long (max {MAX_CHARS} characters).")

    source, target = resolve_direction(text, mode)
    try:
        translation, provider = translate_text(text, source, target)
    except RuntimeError:
        return error(
            "Translation failed. Check the server console for the cause "
            "(usually a network, proxy or VPN issue).",
            502,
        )

    return jsonify(
        {"translation": translation, "source": source, "target": target, "provider": provider}
    )


@app.post("/api/analyze")
def api_analyze():
    if client is None:
        return error("GEMINI_API_KEY is not configured on the server.", 500)

    data = request.get_json(silent=True) or {}
    source_text = (data.get("source_text") or "").strip()
    translation = (data.get("translation") or "").strip()
    source = data.get("source")

    if not source_text or not translation or source not in ("en", "de"):
        return error("Invalid request.")
    if len(source_text) > MAX_CHARS or len(translation) > MAX_CHARS * 3:
        return error("Text too long.")

    german = source_text if source == "de" else translation
    english = translation if source == "de" else source_text

    prompt = f"""You are an expert German teacher explaining grammar to an English-speaking learner.

German text: {german}
English equivalent: {english}

Analyze the GERMAN text. Write all explanations in English.
- tense and mood: name them precisely (e.g. "Perfekt", "Konjunktiv II").
- sentence_structure: word order (V2, verb-final in subordinate clauses, separable verbs, Satzklammer).
- components: go through the meaningful parts of the sentence. For each noun phrase or pronoun give its
  case (Nominative/Accusative/Dative/Genitive) and WHY (verb government, preposition, etc.).
  Use "n/a" for case_or_form on items where case doesn't apply and give the relevant form instead.
- verbs: every verb with its infinitive and conjugation (person, number, tense, irregularities).
- idioms_and_nuance: idioms, register (formal/informal Sie/du), false friends, or cultural notes.
  Return an empty list if there are none.
Be accurate and concise. Do not invent grammar that is not present in the text."""

    try:
        response = gemini_generate(
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=Breakdown,
                temperature=0.2,
            ),
        )
        breakdown = response.parsed
        if breakdown is None:
            return error("The AI returned an unreadable response. Try again.", 502)
        return jsonify(breakdown.model_dump())
    except Exception as exc:
        msg = str(exc)
        log.warning("Gemini analysis failed: %s: %s", type(exc).__name__, msg[:500])
        if _is_transient(msg):
            return error("Gemini is overloaded right now. Please try again in a moment.", 503)
        if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
            return error("Free-tier rate limit reached. Wait a minute and retry.", 429)
        return error("The AI analysis failed. Please try again.", 502)


@app.post("/api/align")
def api_align():
    """Word-by-word links between the original sentence and its translation. Only exact matches are linked."""
    if client is None:
        return error("GEMINI_API_KEY is not configured on the server.", 500)

    data = request.get_json(silent=True) or {}
    source_text = (data.get("source_text") or "").strip()
    translation = (data.get("translation") or "").strip()
    source = data.get("source")

    if not source_text or not translation or source not in ("en", "de"):
        return error("Invalid request.")
    if len(source_text) > MAX_CHARS or len(translation) > MAX_CHARS * 3:
        return error("Text too long.")

    src_tokens, tgt_tokens = tokenize(source_text), tokenize(translation)
    names = {"en": "English", "de": "German"}
    target = "de" if source == "en" else "en"
    numbered = lambda toks: "\n".join(f"{i}: {t}" for i, t in enumerate(toks))

    prompt = f"""You are aligning a sentence with its translation to draw connecting lines between them.

ORIGINAL ({names[source]}), numbered tokens:
{numbered(src_tokens)}

TRANSLATION ({names[target]}), numbered tokens:
{numbered(tgt_tokens)}

Return a list of links. Each link connects token indices of the original to token indices of the translation.

STRICT RULES. Only create a link when the match is 100% clear and certain:
- The two sides must mean exactly the same thing in this sentence: a direct dictionary-style equivalent
  (noun to noun, verb to verb, pronoun to pronoun, preposition to preposition, number to number, adjective to adjective...).
- A link may cover several NEIGHBOURING tokens on either side when together they form one exact equivalent
  (for example German "das Buch" = English "the book", "habe gegeben" = "gave"). Indices in one side of a link must be consecutive.
  Separable verbs whose parts are not next to each other (e.g. "rufe ... an") cannot be linked.
- If there is any doubt, leave it out. It is much better to link too little than to link something wrong.
- Do NOT link: punctuation; words with no real counterpart on the other side (a stray auxiliary such as "to do",
  expletive "es" / "it", reflexive pronouns without an English counterpart); loose paraphrases;
  idioms or fixed expressions unless the whole expression matches as a whole; words whose pairing depends on interpretation.
- Each token may be used in at most one link.
- category is one of: noun, verb, pronoun, preposition, adjective, adverb, number, conjunction, other.
Return an empty list if nothing is certain."""

    try:
        response = gemini_generate(
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=Alignment,
                temperature=0,
            ),
        )
        parsed = response.parsed
        if parsed is None:
            return error("The AI returned an unreadable response. Try again.", 502)
        links = clean_links(parsed.links, len(src_tokens), len(tgt_tokens), src_tokens, tgt_tokens)
        return jsonify({"source_tokens": src_tokens, "target_tokens": tgt_tokens, "links": links})
    except Exception as exc:
        msg = str(exc)
        log.warning("Gemini alignment failed: %s: %s", type(exc).__name__, msg[:500])
        if _is_transient(msg):
            return error("Gemini is overloaded right now, so the word links are unavailable.", 503)
        if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
            return error("Free-tier rate limit reached, so the word links are unavailable.", 429)
        return error("The word links could not be generated.", 502)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
