/* Grammar search: type-ahead over a German grammar glossary plus the terms in the current AI Deep Dive.
   Everything is rendered with textContent / DOM nodes, never innerHTML. */
(function (root) {
  "use strict";

  // [term, category, definition, example, aliases[]]
  const G = [
    ["Nominativ", "Case", "The case of the subject: who or what does the action. Also used after sein and werden.", "Der Mann liest. (The man reads.)", ["nominative", "subject case", "1st case", "wer"]],
    ["Akkusativ", "Case", "The case of the direct object: who or what the action happens to. Only masculine articles change: der becomes den.", "Ich sehe den Hund. (I see the dog.)", ["accusative", "direct object case", "4th case", "wen"]],
    ["Dativ", "Case", "The case of the indirect object (the recipient) and of words after certain verbs and prepositions. dem / der / dem / den + n.", "Ich gebe dem Kind das Buch. (I give the child the book.)", ["dative", "indirect object case", "3rd case", "wem"]],
    ["Genitiv", "Case", "The case of possession. des / der / des / der, and masculine and neuter nouns usually add -s or -es.", "Das Auto des Mannes. (The man's car.)", ["genitive", "possessive case", "2nd case", "wessen"]],
    ["Subjekt", "Sentence part", "The word or phrase that does the action. It is in the Nominativ and the verb agrees with it.", "Die Lehrerin schreibt. (The teacher writes.)", ["subject"]],
    ["Direktes Objekt", "Sentence part", "Receives the action directly. It stands in the Akkusativ.", "Er kauft einen Apfel. (He buys an apple.)", ["direct object", "akkusativobjekt"]],
    ["Indirektes Objekt", "Sentence part", "The recipient or beneficiary of the action. It stands in the Dativ.", "Sie schenkt ihrer Mutter Blumen. (She gives her mother flowers.)", ["indirect object", "dativobjekt"]],
    ["Prädikat", "Sentence part", "The verb part of the sentence, including auxiliary verbs, participles and separable prefixes.", "Ich habe gegessen.", ["predicate"]],
    ["Adverbiale", "Sentence part", "A word or phrase giving time, place, manner or reason. It can sit in several positions.", "Gestern bin ich nach Hause gegangen. (Yesterday I went home.)", ["adverbial", "adverbial modifier", "adverb"]],
    ["Artikel", "Word class", "The word before a noun. Bestimmt (der, die, das) or unbestimmt (ein, eine). It carries the case, gender and number.", "der Tisch, ein Tisch", ["article", "definite article", "indefinite article", "bestimmter artikel", "unbestimmter artikel"]],
    ["Genus", "Noun feature", "Grammatical gender: maskulin (der), feminin (die), neutral (das). It must be learned with each noun.", "der Löffel, die Gabel, das Messer", ["gender", "masculine", "feminine", "neuter", "maskulin", "feminin", "neutrum"]],
    ["Numerus", "Noun feature", "Singular or plural. German plurals use several endings and often an umlaut.", "das Buch, die Bücher", ["number", "singular", "plural"]],
    ["Pronomen", "Word class", "A word replacing a noun. Personal pronouns change by case: ich, mich, mir.", "Er gibt es ihr. (He gives it to her.)", ["pronoun", "personal pronoun", "personalpronomen"]],
    ["Reflexivpronomen", "Word class", "Refers back to the subject: mich, dich, sich, uns, euch. Used with reflexive verbs.", "Ich freue mich. (I am happy.)", ["reflexive pronoun", "reflexive verb", "reflexives verb"]],
    ["Possessivartikel", "Word class", "Shows ownership: mein, dein, sein, ihr, unser, euer. Ending follows the noun like ein.", "Das ist meine Tasche. (That is my bag.)", ["possessive", "possessive article", "possessive determiner"]],
    ["Adjektivdeklination", "Declension", "Adjectives before nouns take endings that depend on the article, case, gender and number.", "ein großer Hund, der große Hund", ["adjective ending", "adjective endings", "adjective declension", "starke deklination", "schwache deklination"]],
    ["Deklination", "Declension", "Changing articles, adjectives and nouns by case, gender and number.", "den kleinen Kindern", ["declension", "declined"]],
    ["N-Deklination", "Declension", "A group of masculine nouns that take -n or -en in every case except the Nominativ singular.", "der Student, den Studenten", ["weak noun", "weak masculine", "n declension"]],
    ["Präposition", "Word class", "Links a noun to the sentence and decides its case.", "mit dem Bus, für den Freund", ["preposition", "prepositions"]],
    ["Wechselpräposition", "Preposition", "Two-way preposition: Akkusativ for movement toward, Dativ for location. an, auf, hinter, in, neben, über, unter, vor, zwischen.", "Ich gehe in die Stadt. Ich bin in der Stadt.", ["two-way preposition", "dual preposition", "two way preposition"]],
    ["Verb", "Word class", "The word expressing an action or state. In German it conjugates by person and number.", "gehen, ich gehe, du gehst", ["verbs"]],
    ["Infinitiv", "Verb form", "The basic form of a verb, ending in -en or -n. This is the dictionary form.", "machen, sammeln", ["infinitive", "base form", "dictionary form"]],
    ["Konjugation", "Verb form", "Changing a verb for person, number, tense and mood.", "ich mache, du machst, er macht", ["conjugation", "conjugated"]],
    ["Finites Verb", "Verb form", "The verb form that agrees with the subject. In a main clause it sits in position two.", "Ich habe gegessen. (habe is finite)", ["finite verb", "finite verb form", "finit"]],
    ["Hilfsverb", "Verb", "Auxiliary verb: haben, sein or werden. Combines with a participle or infinitive to form compound tenses.", "Ich habe gelernt. Er ist gekommen.", ["auxiliary", "auxiliary verb", "helping verb"]],
    ["Modalverb", "Verb", "Verb showing ability, permission or necessity: können, müssen, dürfen, sollen, wollen, mögen. The main verb goes to the end as an infinitive.", "Ich muss gehen. (I have to go.)", ["modal verb", "modal", "modal verbs"]],
    ["Trennbares Verb", "Verb", "Separable verb: the prefix splits off and goes to the end of the main clause.", "Ich rufe dich an. (anrufen)", ["separable verb", "separable prefix", "trennbar", "separable"]],
    ["Untrennbares Verb", "Verb", "Inseparable verb with a prefix that never splits (be-, ent-, er-, ver-, zer-). The participle has no ge-.", "Ich verstehe es. Ich habe es verstanden.", ["inseparable verb", "inseparable"]],
    ["Starkes Verb", "Verb", "Strong verb: the stem vowel changes in the Präteritum and often in the Partizip II.", "singen, sang, gesungen", ["strong verb", "irregular verb", "unregelmäßiges verb"]],
    ["Schwaches Verb", "Verb", "Weak (regular) verb: stem stays the same and it uses -te and ge-…-t.", "machen, machte, gemacht", ["weak verb", "regular verb", "regelmäßiges verb"]],
    ["Gemischtes Verb", "Verb", "Mixed verb: changes its stem like a strong verb but takes weak endings.", "denken, dachte, gedacht", ["mixed verb"]],
    ["Partizip II", "Verb form", "Past participle. Used for the Perfekt, Plusquamperfekt and the Passiv. Typically ge- + stem + -t or -en.", "gemacht, gegangen, gesehen", ["past participle", "participle", "partizip 2", "partizip perfekt", "partizip"]],
    ["Partizip I", "Verb form", "Present participle: infinitive + d. Used mostly as an adjective.", "lachend, das schlafende Kind", ["present participle", "partizip 1", "partizip präsens"]],
    ["Präsens", "Tense", "Present tense. Also used for the near future when there is a time word.", "Ich lerne Deutsch. Morgen fahre ich nach Berlin.", ["present", "present tense", "simple present"]],
    ["Perfekt", "Tense", "Present perfect. haben or sein in position two plus the Partizip II at the end. The usual spoken past tense.", "Ich habe das Buch gelesen. (I read the book.)", ["present perfect", "perfect tense", "conversational past", "spoken past"]],
    ["Präteritum", "Tense", "Simple past. Common in writing, narration, and with sein, haben and the modal verbs.", "Er war müde. Sie ging nach Hause.", ["simple past", "preterite", "imperfect", "past tense", "imperfekt"]],
    ["Plusquamperfekt", "Tense", "Past perfect: an event before another past event. Präteritum of haben/sein + Partizip II.", "Ich hatte schon gegessen, als er kam.", ["past perfect", "pluperfect"]],
    ["Futur I", "Tense", "Future tense: werden + infinitive at the end. Often replaces by Präsens plus a time word.", "Ich werde dich anrufen. (I will call you.)", ["future", "future tense", "futur", "futur 1"]],
    ["Futur II", "Tense", "Future perfect: werden + Partizip II + haben/sein. Often used for guesses about the past.", "Er wird es vergessen haben.", ["future perfect", "futur 2"]],
    ["Indikativ", "Mood", "Mood of facts and real events. The default mood.", "Er kommt morgen.", ["indicative", "indicative mood"]],
    ["Konjunktiv II", "Mood", "Subjunctive for wishes, polite requests and unreal conditions. Often formed as würde + infinitive.", "Wenn ich Zeit hätte, käme ich. (If I had time, I would come.)", ["subjunctive", "subjunctive ii", "konjunktiv 2", "conditional", "hypothetical", "würde"]],
    ["Konjunktiv I", "Mood", "Subjunctive for reported speech. Mostly in news writing.", "Er sagt, er sei krank. (He says he is ill.)", ["subjunctive i", "konjunktiv 1", "reported speech", "indirect speech", "indirekte rede"]],
    ["Imperativ", "Mood", "Mood for commands and requests. Has du, ihr and Sie forms.", "Komm her! Kommt her! Kommen Sie her!", ["imperative", "command"]],
    ["Passiv", "Voice", "Passive voice: werden + Partizip II. The subject receives the action.", "Das Haus wird gebaut. (The house is being built.)", ["passive", "passive voice", "vorgangspassiv"]],
    ["Zustandspassiv", "Voice", "Stative passive: sein + Partizip II. Describes the resulting state.", "Die Tür ist geschlossen. (The door is closed.)", ["stative passive", "state passive"]],
    ["Aktiv", "Voice", "Active voice: the subject does the action.", "Der Mann baut das Haus.", ["active", "active voice"]],
    ["V2-Wortstellung", "Word order", "Verb-second: in a main clause the finite verb is always in position two, whatever comes first.", "Heute gehe ich ins Kino. (Today go I to the cinema.)", ["v2", "verb second", "verb-second", "word order", "wortstellung", "second position"]],
    ["Satzklammer", "Word order", "Verbal bracket: the finite verb is in position two and the rest of the verb (participle, infinitive, prefix) closes the clause at the end.", "Ich habe gestern das Buch gelesen.", ["verbal bracket", "bracket", "sentence bracket", "verbklammer"]],
    ["Mittelfeld", "Word order", "The middle field between the two parts of the Satzklammer. Order: time, manner, place (te-ka-mo-lo), with pronouns early.", "Ich habe ihm gestern das Buch gegeben.", ["middle field", "te ka mo lo", "tekamolo"]],
    ["Vorfeld", "Word order", "The first position before the finite verb. Holds exactly one element.", "Gestern habe ich es gesehen.", ["prefield", "front field", "first position"]],
    ["Nachfeld", "Word order", "The field after the closing verb part. Often holds extra clauses or comparisons.", "Er hat gesagt, dass er kommt.", ["post field", "postfield"]],
    ["Inversion", "Word order", "Subject and verb swap places when another element opens the sentence.", "Morgen gehe ich. (not: Morgen ich gehe)", ["inverted", "subject verb inversion"]],
    ["Nebensatz", "Clause", "Subordinate clause. Introduced by a conjunction and the finite verb goes to the end.", "…, weil ich müde bin.", ["subordinate clause", "dependent clause", "verb final", "verb-final", "verb last", "verbendstellung"]],
    ["Hauptsatz", "Clause", "Main clause that can stand alone. Finite verb in position two.", "Ich bleibe zu Hause.", ["main clause", "independent clause"]],
    ["Konjunktion", "Word class", "Joins clauses. Coordinating (und, aber, oder, denn, sondern) keep word order; subordinating (weil, dass, wenn, obwohl) send the verb to the end.", "Ich gehe, weil ich Hunger habe.", ["conjunction", "subordinating conjunction", "coordinating conjunction", "subjunktion"]],
    ["Relativsatz", "Clause", "Relative clause: describes a noun, introduced by der, die, das, etc. Verb at the end.", "Der Mann, der dort steht, ist mein Onkel.", ["relative clause", "relative pronoun", "relativpronomen"]],
    ["Infinitivsatz", "Clause", "Infinitive clause with zu: um … zu, ohne … zu, statt … zu.", "Ich lerne, um Deutsch zu sprechen.", ["infinitive clause", "zu infinitive", "um zu", "um…zu"]],
    ["Verneinung", "Syntax", "Negation: nicht negates verbs and adjectives; kein negates nouns that would take ein or no article.", "Ich habe keine Zeit. Ich komme nicht.", ["negation", "nicht", "kein", "negative"]],
    ["Komparativ", "Adjective", "Comparative: adjective + -er (and often an umlaut). Compared with als.", "Er ist größer als ich.", ["comparative", "comparison"]],
    ["Superlativ", "Adjective", "Superlative: am + adjective + -sten, or der/die/das + -ste.", "Sie ist am schnellsten.", ["superlative"]],
    ["Verbposition", "Word order", "Where the verb stands: position two in main clauses, last in subordinate clauses, first in questions and commands.", "Kommst du? Ich glaube, dass du kommst.", ["verb position", "verb placement"]],
    ["Temporaladverb", "Adverb", "Adverb of time: gestern, heute, morgen, oft, immer, schon. Usually comes early in the Mittelfeld.", "Ich habe gestern gearbeitet.", ["temporal adverb", "time adverb", "adverb of time"]],
    ["Ditransitives Verb", "Verb", "A verb taking both a Dativ and an Akkusativ object, such as geben, zeigen, schenken.", "Ich zeige dem Kind das Bild.", ["ditransitive", "ditransitive verb", "two objects"]],
    ["Transitiv", "Verb", "Verb that takes a direct object in the Akkusativ.", "Ich lese ein Buch.", ["transitive", "transitive verb", "transitives verb"]],
    ["Intransitiv", "Verb", "Verb that takes no direct object. Many use sein in the Perfekt.", "Er ist gegangen.", ["intransitive", "intransitive verb"]],
    ["Dativverb", "Verb", "Verb that takes only a Dativ object: helfen, danken, gefallen, gehören.", "Ich helfe dir. (not: dich)", ["dative verb", "verbs with dative"]],
    ["Verb mit Präposition", "Verb", "Verb tied to a fixed preposition that decides the case.", "warten auf + Akkusativ: Ich warte auf dich.", ["prepositional verb", "verb with preposition", "fixed preposition"]],
    ["Redewendung", "Idiom", "Idiom or fixed expression whose meaning cannot be guessed word by word.", "Ich verstehe nur Bahnhof. (It's all Greek to me.)", ["idiom", "idioms", "expression", "phrase", "idiomatic"]],
    ["Du / Sie", "Register", "Informal (du) versus formal (Sie) address. Sie takes the 3rd person plural verb and is capitalised.", "Wie heißt du? / Wie heißen Sie?", ["formal", "informal", "formality", "register", "politeness", "duzen", "siezen"]],
    ["Umlaut", "Spelling", "The vowel change ä, ö, ü. Appears in plurals, comparatives and some verb forms.", "der Vater, die Väter", ["umlauts", "diaeresis"]],
    ["Ablaut", "Spelling", "The vowel change within a strong verb's stem across its principal parts.", "trinken, trank, getrunken", ["vowel change", "stem change"]],
    ["Stammform", "Verb form", "Principal parts: infinitive, 3rd person Präteritum, Partizip II. Learn them together.", "gehen, ging, gegangen", ["principal parts", "stem form"]],
    ["Perfekt mit sein", "Tense", "Verbs of movement or change of state form the Perfekt with sein, not haben.", "Ich bin gefahren. Er ist aufgewacht.", ["perfect with sein", "sein auxiliary", "sein perfekt"]],
    ["Partikel", "Word class", "Small words such as doch, mal, ja, eben, halt that add tone or attitude without a direct translation.", "Komm doch mal vorbei!", ["particle", "modal particle", "modalpartikel", "discourse particle"]],
    ["Gender-Ausnahmen", "Noun feature", "Common exceptions to gender rules, e.g. das Mädchen is neuter because of the -chen ending.", "das Mädchen, das Brötchen", ["gender exceptions", "gender rules"]],
  ];

  const ENTRIES = G.map(([term, category, definition, example, aliases]) => ({
    term, category, definition, example, aliases: aliases || [], source: "glossary",
  }));

  // lowercase, strip diacritics, ß -> ss
  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/ß/g, "ss")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim();
  }

  function words(s) { return norm(s).split(/[^a-z0-9]+/).filter(Boolean); }

  function hasWholePhrase(hay, needle) {
    const n = norm(needle);
    if (n.length < 3) return false;
    const i = hay.indexOf(n);
    if (i < 0) return false;
    const before = hay[i - 1];
    return !before || !/[a-z0-9]/.test(before);
  }

  // Flatten every string in a Breakdown object into one searchable blob.
  function blob(d) {
    if (!d) return "";
    const parts = [d.summary, d.tense, d.mood, d.sentence_structure];
    (d.components || []).forEach((c) => parts.push(c.text, c.role, c.case_or_form, c.explanation));
    (d.verbs || []).forEach((v) => parts.push(v.form, v.infinitive, v.conjugation));
    (d.idioms_and_nuance || []).forEach((n) => parts.push(n));
    return norm(parts.filter(Boolean).join(" \n "));
  }

  // Build the index for the current analysis: glossary terms flagged as "used here", plus the sentence's own words.
  function buildIndex(d) {
    const text = blob(d);
    const list = ENTRIES.map((e) => {
      const used = !!text && [e.term, ...e.aliases].some((t) => hasWholePhrase(text, t));
      return Object.assign({}, e, { used });
    });
    const own = [];
    if (d) {
      (d.components || []).forEach((c) => {
        if (!c.text) return;
        own.push({
          term: c.text, category: "In your sentence", source: "sentence",
          definition: [c.role, c.case_or_form].filter(Boolean).join(" · ") + (c.explanation ? ". " + c.explanation : ""),
          example: "", aliases: [c.role, c.case_or_form].filter(Boolean), used: true,
        });
      });
      (d.verbs || []).forEach((v) => {
        if (!v.form) return;
        own.push({
          term: v.form, category: "In your sentence", source: "sentence",
          definition: `Form of ${v.infinitive}. ${v.conjugation || ""}`.trim(),
          example: "", aliases: [v.infinitive].filter(Boolean), used: true,
        });
      });
    }
    return own.concat(list);
  }

  // Score one entry for a query. Higher is better, 0 means no match.
  function score(e, q) {
    const nq = norm(q);
    if (!nq) return 0;
    const t = norm(e.term);
    let s = 0;
    if (t === nq) s = 100;
    else if (t.startsWith(nq)) s = 85;
    else if (words(e.term).some((w) => w.startsWith(nq))) s = 65;
    else {
      for (const a of e.aliases) {
        const na = norm(a);
        if (!na) continue;
        if (na === nq) s = Math.max(s, 80);
        else if (na.startsWith(nq)) s = Math.max(s, 72);
        else if (words(a).some((w) => w.startsWith(nq))) s = Math.max(s, 52);
      }
      if (!s && nq.length >= 2 && t.includes(nq)) s = 30;
      if (!s && nq.length >= 3 && norm(e.definition).includes(nq)) s = 10;
    }
    if (!s) return 0;
    if (e.used) s += 12;
    if (e.source === "sentence") s += 4;
    return s;
  }

  function search(index, q, limit = 7) {
    const seen = new Set();
    return index
      .map((e) => ({ e, s: score(e, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.e.term.length - b.e.term.length)
      .filter((x) => {
        const k = norm(x.e.term) + "|" + x.e.source;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, limit)
      .map((x) => x.e);
  }

  // Terms to show before the user types anything.
  const STARTERS = ["Akkusativ", "Dativ", "Perfekt", "Satzklammer", "Konjunktiv II", "Trennbares Verb"];

  root.GrammarSearch = { norm, buildIndex, search, score, ENTRIES, STARTERS };
  if (typeof module !== "undefined" && module.exports) module.exports = root.GrammarSearch;
})(typeof window !== "undefined" ? window : globalThis);
