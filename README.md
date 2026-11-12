# English ⇄ German Translator with AI Grammar Deep Dive

A Flask web app that translates between English and German, then explains the grammar of the sentence with Gemini.

## Features

- **Bi-directional translation** with auto-detect or a manual EN → DE / DE → EN toggle. Google Translate is used first, with MyMemory and Gemini as fallbacks.
- **AI Deep Dive**: tense, mood, word order, a case-by-case breakdown of each phrase, verb conjugations, and idioms or nuance, in collapsible sections.
- **Word links**: a graphic that draws a line between the original and the translated words, only where the match is 100% certain.
- **Grammar search**: type-ahead search over a German grammar glossary and the terms used in the current Deep Dive.
- Resilient Gemini calls: automatic model discovery, retries on overload, and fallback to the next model.

## Setup

```bash
python -m venv venv
venv\Scripts\activate        # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
copy .env.example .env       # macOS/Linux: cp .env.example .env
```

Put your free Gemini API key in `.env` (get one at https://aistudio.google.com/apikey):

```
GEMINI_API_KEY=your_key_here
```

## Run

```bash
python app.py
```

Then open http://127.0.0.1:5000. On Windows you can also double-click `run_app.bat`.

## Project layout

```
app.py               Flask routes: /api/translate, /api/analyze, /api/align
templates/index.html Page layout (Tailwind CDN)
static/script.js     Main UI logic
static/align.js      Word links graphic
static/glossary.js   Grammar glossary and search engine
static/searchpanel.js Search panel UI
```

AI explanations can contain mistakes. Check anything that matters.
