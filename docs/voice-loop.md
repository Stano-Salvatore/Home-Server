# Nedory Voice — hands-free "Hey Nedory" on the S21

Talk to Nedory out loud from a dedicated phone (mic + speakers, plugged in,
sitting at home) without touching it: "Hey Nedory, what's the weather
tomorrow in Bratislava?" → it answers out loud.

This is Phase 3 (push-to-talk, proves the pipeline) and Phase 4 (hands-free
wake word) from the original plan, combined into one script — see
`bin/nedory-voice` and the design notes at the top of it. It intentionally
skips the "tiny native Porcupine app" the original plan called for: instead
of a dedicated wake-word model needing a native Android build, it polls
short audio chunks through the same whisper.cpp you already need for the
question itself, and checks the transcript for the wake word. Slower and
hungrier than a real wake-word engine, but it's buildable entirely inside
Termux with tools this loop needs anyway — no Picovoice signup, no native
Android app, no libc-compatibility gamble (Porcupine's Python SDK ships a
binary built for glibc; Termux runs on Android's bionic libc, so `pip
install pvporcupine` may just not run — worth trying later as an upgrade,
not the thing to build the first working version around).

## What runs where

```
S21 (voice phone, mic + speakers)          S25 (or wherever Nedory runs)
┌─────────────────────────────┐            ┌──────────────────────────┐
│ bin/nedory-voice             │  Tailscale │ Nedory dashboard :3000    │
│  listen loop (tmux)          │───────────▶│  POST /api/voice/ask      │
│  whisper.cpp (STT, on-device)│  http      │   → litert-lm + web search│
│  termux-tts-speak (TTS)      │◀───────────│   → plain-text answer     │
└─────────────────────────────┘            └──────────────────────────┘
```

The S21 only needs Termux + Termux:API + whisper.cpp. It does not need this
repo cloned, and it doesn't run any part of the dashboard.

## Setup on the S21

1. **Termux + Termux:API.** Install both from F-Droid (not the Play Store
   build — it's out of date and can't reach current package repos).

2. **Packages:**
   ```
   pkg update
   pkg install termux-api ffmpeg jq tmux clang cmake make git
   termux-setup-storage       # grants storage; also triggers the mic
                               # permission prompt the first time you record
   ```

3. **Build whisper.cpp** (a few minutes on a phone CPU):
   ```
   cd ~
   git clone https://github.com/ggml-org/whisper.cpp
   cd whisper.cpp
   cmake -B build && cmake --build build --config Release -j"$(nproc)"
   bash ./models/download-ggml-model.sh tiny.en
   ```
   `bin/nedory-voice` looks for the binary at `build/bin/whisper-cli` (newer
   whisper.cpp), then `whisper-cli`, then `main` (older) — whichever it
   built. If yours lands somewhere else, set `WHISPER_BIN` in
   `~/.nedory-voice.env`. `tiny.en` is the fastest model and the default;
   `base.en` is more accurate but slower per chunk — worth trying if the
   wake word keeps getting missed.

4. **Install the script** (from this repo, e.g. by pulling it up in a
   browser or `curl`-ing the raw file from GitHub, then):
   ```
   chmod +x nedory-voice
   mv nedory-voice $PREFIX/bin/nedory-voice
   ```

5. **Configure.** Find the S25's (or wherever Nedory runs) Tailscale IP —
   `tailscale ip -4` on that device, or check the Tailscale admin console.
   Create `~/.nedory-voice.env`:
   ```
   NEDORY_URL="http://100.x.x.x:3000"
   WAKE_WORDS="nedory,the story,nedori"
   ```
   `WAKE_WORDS` is a comma-separated, case-insensitive substring list —
   whisper's tiny model can mishear a made-up name, so list plausible
   mishearings as you discover them (run `nedory-voice ask` a few times and
   watch what it actually transcribes "Nedory" as).

## Try it

**Push-to-talk first** — proves the pipeline before adding the wake-word
polling loop on top:
```
nedory-voice ask
```
It TTS-prompts "Go ahead", records 5 seconds, transcribes, asks Nedory,
speaks the answer back. If this doesn't work, hands-free won't either — fix
this path first (see Troubleshooting).

**Then hands-free:**
```
nedory-voice listen     # starts in tmux, keeps running if you background Termux
nedory-voice status     # check it's still up
nedory-voice stop       # stop it
tmux attach -t nedory-voice   # watch what it's hearing/transcribing live
```
Say "Hey Nedory" (or just "Nedory"), wait for the "Yes?" prompt, then ask
your question.

## Troubleshooting

- **Nothing happens on `ask`** — run `termux-microphone-record -f
  ~/test.m4a -l 3` by hand; if that errors, it's a permission problem (redo
  `termux-setup-storage`, check Android's per-app mic permission for
  Termux:API).
- **"Didn't catch anything" every time** — check `~/.nedory-voice/ptt.wav`
  exists and isn't 0 bytes (a `-l` limit that doesn't match what your
  Termux:API version expects is the usual cause); play it back
  (`termux-media-player play ~/.nedory-voice/ptt.wav`) to confirm audio was
  actually captured.
- **"No answer — is Nedory reachable"** — `curl
  http://100.x.x.x:3000/api/voice/ask -d '{"text":"hello"}'` by hand from
  the S21's Termux; if that fails, it's Tailscale/network, not this script
  (check `tailscale status` on both devices, confirm the dashboard is
  actually up with `nedory status` on the S25).
- **The listen loop stops when you lock the phone** — same root cause as
  the Tasks scheduler bug this project already hit once: Android kills
  backgrounded Termux processes. Confirm it's actually running in tmux
  (`nedory-voice status`), and check Android's battery settings for
  Termux — set it to "unrestricted"/disable battery optimization, or the OS
  will kill the tmux session's parent process regardless.
- **False wake-ups / it keeps triggering on silence** — a known whisper.cpp
  quirk (tiny models can hallucinate short phrases on background noise).
  There's no noise gate yet; tightening `WAKE_WORDS` to something less
  common helps some. A proper VAD (voice-activity gate before transcribing
  at all) or swapping the polling loop for a real wake-word engine is the
  real fix — see the Porcupine note above if you want to try it, but expect
  to spend time on it, not "swap one line."
- **Answers are slow** — the polling loop's 3-second chunks plus a whisper
  inference each cycle is the latency floor before you even ask a question;
  `tiny.en` over `base.en` trades accuracy for speed here. The chat answer
  itself runs on litert-lm CPU-only today (LiteRT-LM issue #1929) — the
  GPU-behind-HTTP wrapper in `docs/TODO.md`'s build queue speeds this up
  too, once it exists.

## Known gaps (see `docs/TODO.md`)

- No VAD/noise gate — false wake-ups are possible on a noisy room.
- Fixed-duration recording windows (not silence-terminated) — a longer
  question can get cut off at 6 seconds.
- `/api/voice/ask` always targets the default litert-lm model; it doesn't
  yet read `NEDORY_URL`-side Settings for a different default.
- No Home Assistant control from voice yet — this is Phase 3+4 (answering
  questions) only. "Turn off the AC" is Phase 5 territory (OptiPlex +
  Nedory writing/calling HA automations).
