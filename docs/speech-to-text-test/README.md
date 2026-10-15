# Speech-to-text test

Do transcribers keep a learner's grammar mistakes, or silently fix them? Accuracy benchmarks don't measure this, and a speaking mode that checks grammar (docs/design.md §15, "Speech (speaking)") needs the mistakes to survive. The test reads 45 German lines (30 with one deliberate A1–A2 mistake, 15 correct) through each transcriber and compares the transcripts with what was said.

**Result (2026-10-15):** Scribe v2 kept 21 of 30 mistakes and got all 15 correct lines right; AssemblyAI Universal-3.5 Pro kept 14 (16 with a prompt). Details in docs/design.md §16.

The tool that ran it was not kept; this page has what is needed to rebuild it: the reading script, the answer key (`lines.json`: `block`, `said`, and `correct` and `type` for a line with a mistake) and the method. The author's recordings and the raw responses stay on the author's Mac in `data/stt-test/` (git-ignored).

## Recording

- iPhone Voice Memos, one memo per block, in a quiet room.
- Read each line once, then pause about 3 s. Don't pause that long inside a line, and don't repeat or correct a line.
- Say the mistakes (marked \* below) as if they were right: same speed and confidence as the correct lines.
- Save the memos as `data/stt-test/Block 1.m4a` … `Block 5.m4a`.

## Reading script

\* = deliberate mistake: read it exactly as written.

**Block 1**

1. Ich sehe der Mann. \*
2. Die Tischen sind sehr alt. \*
3. Meine Mutter sprecht sehr gut Deutsch. \*
4. Ich bin nach Berlin gefahren.
5. Ich weiß, dass er kommt morgen. \*
6. Kannst du mir helfen?
7. Das Wetter ist heute schöne. \*
8. Ich habe einen Bruder und eine Schwester.
9. Ich habe zu viel Kaffee getrinkt. \*

**Block 2**

10. Ich fahre mit der Bus zur Arbeit. \*
11. Das ist ein guter Freund.
12. Er gehen jeden Tag in die Schule. \*
13. Morgen gehe ich ins Kino.
14. Ich habe nicht Zeit. \*
15. Ich muss heute arbeiten.
16. Am Montag habe ich einen Termin beim Arzt.
17. Ich kaufe drei Apfel. \*
18. Der Zug abfährt um acht Uhr. \*

**Block 3**

19. Ich habe ein Bruder und eine Schwester. \*
20. Die Tische sind sehr alt.
21. Du fahrst zu schnell. \*
22. Er ist das Buch schon gelesen. \*
23. Morgen ich gehe ins Kino. \*
24. Kannst du mich helfen? \*
25. Nach die Arbeit gehe ich einkaufen. \*
26. Ich sehe den Mann.
27. Wir haben gestern lange gearbeiten. \*

**Block 4**

28. Das ist ein gute Freund. \*
29. Ich fahre mit dem Bus zur Arbeit.
30. Wir spielt am Wochenende Fußball. \*
31. Ich habe nach Berlin gefahren. \*
32. Ich anrufe dich heute Abend. \*
33. Ich muss heute arbeite. \*
34. Ich wohne bei meine Eltern. \*
35. Die Kinder spielen im Garten.
36. Wir haben einen großes Garten. \*

**Block 5**

37. der Tisch, die Tische
38. gehen, ging, ist gegeht \*
39. das Mädchen, die Mädchen
40. das Löffel \*
41. schreiben, schrieb, hat geschreibt \*
42. die Wohnung, die Wohnungen
43. der Apfel, die Apfels \*
44. fahren, fuhr, ist gefahren
45. die Tisch \*

Correct lines that are the right version of a mistake line: 26 (1), 20 (2), 8 (19), 11 (28), 29 (10), 4 (31), 13 (23), 6 (24), 15 (33), 37 (45).

## Method

1. **Convert** each memo to 16 kHz mono WAV: `afconvert -f WAVE -d LEI16@16000 -c 1 in.m4a out.wav` (macOS).
2. **Find the lines:** transcribe each whole block once with Scribe v2 and word timestamps; a gap of 1.2 s or more between words ends a line, and each block must give exactly 9 lines. (Splitting by audio level failed on these recordings: background noise bridged the pauses.)
3. **Cut one clip per line:** from the first word's start − 0.4 s (but not before the midpoint to the previous line's last word) to the last word's end + 0.5 s (but not past the midpoint to the next line's first word).
4. **Transcribe every clip with every config:**
   - ElevenLabs Scribe v2: `POST https://api.elevenlabs.io/v1/speech-to-text`, header `xi-api-key`, multipart `model_id=scribe_v2`, `language_code=de`, `timestamps_granularity=word`, `tag_audio_events=false`, `diarize=false`, `file`.
   - AssemblyAI Universal-3.5 Pro: `POST https://api.assemblyai.com/v2/upload` (raw bytes, header `authorization`) → `upload_url`; `POST /v2/transcript` with `{"audio_url", "speech_models": ["universal-3-5-pro"], "language_code": "de"}`; poll `GET /v2/transcript/{id}` until `status` is `completed`.
   - The same with `"prompt": "A non-native speaker who is learning German reads short practice sentences aloud. Many sentences deliberately contain grammatical mistakes."` (AssemblyAI's prompt takes a description of the audio; instructions are ignored).
5. **Score:** compare after lowercasing, removing punctuation and writing the digits 3 and 8 as *drei* and *acht*. A line with a mistake is `kept` (the transcript says what was said), `fixed` (it says the right form) or `other` (garbled, or another sentence). A correct line is `ok` or `wrong`.
6. **Confidence:** for each line, the transcriber's confidence in the deciding word, the word that differs between the wrong and the right form (correct lines use their mistake twin's words). Scribe: `exp(logprob)` of the word; AssemblyAI: `confidence`. Count how many silent fixes and how many correct-line words fall below 0.95, the threshold at which the app would ask the learner to say it again (§15).

Cost of a full run: about 5¢ (3 min of clips through three configs, 5.5 min of whole blocks through Scribe v2), all from the providers' free credits. Prices per audio hour (2026-10-15): Scribe v2 $0.22, Universal-3.5 Pro $0.21, with a prompt $0.26.
