import { useState } from "react";
import { DEFAULT_API_BASE, getApiBase, setApiBase } from "../lib/api";

type TestState =
  | { phase: "idle" }
  | { phase: "testing" }
  | { phase: "ok"; detail: string }
  | { phase: "fail"; detail: string };

export default function Settings() {
  const [value, setValue] = useState(getApiBase());
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<TestState>({ phase: "idle" });

  const save = () => {
    const normalized = setApiBase(value);
    setValue(normalized);
    setSaved(true);
    setTest({ phase: "idle" });
    setTimeout(() => setSaved(false), 2000);
  };

  const testConnection = async () => {
    setTest({ phase: "testing" });
    const base = value.trim().replace(/\/+$/, "");
    try {
      // The agent route only accepts POST, so any HTTP answer (even 405)
      // proves the backend is up and reachable.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${base}/api/agent`, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timer);
      setTest({ phase: "ok", detail: `reachable · HTTP ${res.status}` });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "no response";
      setTest({ phase: "fail", detail: reason });
    }
  };

  return (
    <div className="settings">
      <header className="settings__head">
        <span className="settings__kicker">GROUND CONTROL</span>
        <h2>Connection</h2>
        <p>
          BudgetWing is a thin client — the planner agent runs on the Next.js
          backend in the parent folder. Point this at wherever it's listening.
        </p>
      </header>

      <label className="settings__field">
        <span>API BASE URL</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={DEFAULT_API_BASE}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="url"
        />
      </label>

      <div className="settings__actions">
        <button className="btn btn--solid" onClick={save}>
          {saved ? "Saved ✓" : "Save"}
        </button>
        <button
          className="btn"
          onClick={testConnection}
          disabled={test.phase === "testing"}
        >
          {test.phase === "testing" ? "Pinging…" : "Test connection"}
        </button>
      </div>

      {test.phase === "ok" && (
        <div className="settings__status settings__status--ok">
          SIGNAL ACQUIRED — {test.detail}
        </div>
      )}
      {test.phase === "fail" && (
        <div className="settings__status settings__status--fail">
          NO SIGNAL — {test.detail}. Is the backend running? Wrong IP?
        </div>
      )}

      <div className="settings__hints">
        <h3>Which URL do I use?</h3>
        <dl>
          <dt>Android emulator</dt>
          <dd>
            <code>http://10.0.2.2:3000</code> — the emulator's alias for your
            PC, works out of the box.
          </dd>
          <dt>Physical device</dt>
          <dd>
            Your PC's LAN IP, e.g. <code>http://192.168.1.20:3000</code>.
            Same Wi-Fi network required.
          </dd>
          <dt>Deployed backend</dt>
          <dd>Paste its public URL — e.g. a Vercel deployment.</dd>
        </dl>
      </div>
    </div>
  );
}
