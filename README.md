# Kilo CLI — OSC 7501 status plugin

A ~100-line plugin for the [Kilo CLI](https://kilo.ai) that makes Kilo self-report its live agent status over **OSC 7501** — the ["Program Status Protocol"](https://www.superlogical.com/rex/docs/build/program-status) — so that [herdr](https://herdr.dev) recognizes a Kilo session as an agent. Drop the file into your Kilo plugin directory and your Kilo terminals start appearing in herdr-app's **Agents** pane, with state updates (`working`, `blocked`, `idle`) as the session progresses. It targets **herdr-app** (desktop) and **herdr-core** (`hc`); the herdr TUI does its own process/screen detection and does not need this.

## Why

herdr-core performs **no agent detection at all**: a terminal is treated as an agent only if it self-reports, by writing

```
ESC ] 7501 ; state=<state> : app=<name> BEL
```

Kilo CLI emits nothing of the sort natively, so it never shows up. This is tracked upstream as [Kilo-Org/kilocode#14973](https://github.com/Kilo-Org/kilocode/issues/14973) (native OSC 7501 emission); this plugin implements the same thing from userland. See also the herdr-side report [herdrdev/herdr#5966](https://github.com/herdrdev/herdr/issues/5966) ("kilocode and cline never show up in the Agents pane"). Prior art: [charmbracelet/crush#4041](https://github.com/charmbracelet/crush/pull/4041) (emits OSC 7501) and [manaflow-ai/cmux#18742](https://github.com/manaflow-ai/cmux/pull/18742) (consumes it).

## How it works

Kilo auto-loads every `.js`/`.ts` file in `~/.config/kilo/plugin/` at process start. The plugin registers Kilo's lifecycle hooks and writes one OSC 7501 record per state change to stdout, falling back to `/dev/tty`.

- **Env gate.** If `HC_TERMINAL_ID` (set by herdr-core in every terminal it launches) is absent, the plugin returns no hooks and never writes anything — it is a complete no-op in a normal terminal.
- **Sequence.** `ESC ] 7501 ; state=<state>[:kind=<kind>]:app=kilo ESC \` — e.g. `state=working:app=kilo`, `state=blocked:kind=permission:app=kilo`. herdr-core accepts `idle`, `working`, `done`, `blocked`, `error`; this plugin emits `working`, `blocked`, and `idle`.
- **Event → state mapping.**

| Kilo event | Reported |
| --- | --- |
| `chat.message` | `working` |
| `session.status` with status `active`/`busy`/`pending`/`running`/`streaming`/`working` | `working` |
| `session.status` with status `idle` | `idle` |
| `tool.execute.before` / `tool.execute.after` | `working` |
| `permission.replied`, `question.replied`, `question.rejected` | `working` |
| `session.compacted` | `working` |
| `permission.asked` | `blocked` + `kind=permission` |
| `question.asked` | `blocked` + `kind=question` |
| `session.error` | `blocked` |
| `session.idle` | `idle` |

- **Deduplication.** A record identical to the previous one is suppressed, so repeated tool calls don't spam the pane.
- **`/dev/tty` fallback.** When stdout is not a TTY (e.g. `kilo serve` with redirected output), the sequence is written to the controlling terminal instead.
- **Failure containment.** The plugin never logs and every write is wrapped, so a missing device or a broken pipe can never throw into Kilo.

## Install

```sh
mkdir -p ~/.config/kilo/plugin
cp herdr-core-osc.js ~/.config/kilo/plugin/
```

Then **restart any running Kilo sessions**: plugins are loaded only at process start, so existing terminals will never pick it up.

## Optional: launch-menu entry

To get Kilo in herdr-app's `+` launch menu, add a program to `~/.config/herdr-app/programs.json`:

```json
{
  "name": "Kilo Code",
  "run": ["kilo"],
  "match": ["kilo", "kilocode", ".kilo"]
}
```

## Verify

Start Kilo from a herdr-app terminal, e.g.

```sh
kilo run "hello"
```

then, in another shell:

```sh
hc ls
hc get <terminal-id>
```

The terminal should report `"agent": "kilo"` and move through the state transitions (`working` → `idle`).

## Uninstall

```sh
rm ~/.config/kilo/plugin/herdr-core-osc.js
```

## Compatibility & limitations

- Tested with Kilo 7.8.x and herdr-app 0.1.16 / `hc` 0.1.21 (2026-11).
- The name shown in the Agents pane comes from the `app=kilo` field of the OSC sequence.
- Works with any Kilo started inside herdr-core terminals; Kilo started outside them is invisible to `hc` by design.
- herdr **TUI** users don't need this — herdr ships a separate TUI integration for Kilo.
- The plugin maps the session/lifecycle events Kilo exposes today; new upstream status values are ignored rather than guessed at.

## Upstream context

- [Kilo-Org/kilocode#14973](https://github.com/Kilo-Org/kilocode/issues/14973) — request for native OSC 7501 emission in the CLI
- [herdrdev/herdr#5966](https://github.com/herdrdev/herdr/issues/5966) — Kilo/Cline missing from the Agents pane
- [Program Status Protocol](https://www.superlogical.com/rex/docs/build/program-status) — OSC 7501 spec
- [herdr.dev](https://herdr.dev) — the agent-aware terminal stack (by [herdrdev](https://github.com/herdrdev))

## License

MIT © 2026 Chad Seaman — see [LICENSE](LICENSE).
