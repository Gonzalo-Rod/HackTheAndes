# Saved road demo (local fixture)

`demo.cast` is an asciicast v2 recording of a real PTY run of
`node_modules/.bin/tsx scripts/saved-road-demo.ts` (the same script as `npm run saved-road:demo`),
made with the team's `record-terminal.py`. `transcript.txt` is that recording's output, extracted
verbatim from the cast. Play it with `asciinema play demo.cast`.

What is real: inbound command routing (`chooseReply`), the saved-road flow, the Atomic Memory HTTP
adapter and its validation, the road-alerts service and the reply formatter. ESTADO data is the
repository's bundled SUTRAN snapshot (captured 2026-10-17), served because SUTRAN is disabled.

What is a fixture: Atomic Memory is the in-process stand-in in `src/test-fixtures/atomic-memory.ts`,
not the real service. Drivers use the repository's test numbers and are printed only as
"Driver A/B". No WhatsApp message is sent and no external service is called.

Not shown: EXPOSICION replies (they need the exposure database) and any UI. The feature is
WhatsApp-only, so there is no dashboard screenshot.

`screenshot.png` and `demo.webm` show a terminal player replaying that exact asciicast, not a WhatsApp UI. The recording runs the real demo with `DEMO_PAUSE_MS=1800` to leave time to read each response. Output and timings come from the original process. No replies were invented, and no live WhatsApp message was sent.
