# OCF Renderer — Resume / Pause-Stand

**Stand:** 2026-06-06 · Pause vor dem Implementierungsplan.
Du wolltest in Ruhe das Design reviewen. Alles ist committet & gepusht; nichts geht verloren.

---

## In einem Satz

Das **Renderer-Design ist fertig durchgesprochen und committet**; offen ist nur
dein **Review des Design-Docs** und danach die Entscheidung, ob ich den
**Implementierungsplan** schreibe (writing-plans → subagent-getriebene Umsetzung).

---

## Was du als Nächstes tun wolltest

1. **Design-Doc reviewen:**
   `docs/superpowers/specs/2026-06-06-ocf-renderer-design.md`
   (auf GitHub: https://github.com/opencoachingformat/ocf-renderer/blob/main/docs/superpowers/specs/2026-06-06-ocf-renderer-design.md)
2. Dann mir sagen: **Design ok?** und **Spec-PRs (#5/#6/#7) vorher mergen — ja/nein?**

## Offene Entscheidungen (für mich, wenn du zurück bist)

- [ ] **Design final?** Noch Änderungswünsche am Renderer-Design oder grünes Licht.
- [ ] **Spec-PRs #5/#6/#7 mergen, bevor der Renderer gebaut wird?**
      (Renderer baut dann gegen die finalisierte Spec. Alternativ offen lassen
      und parallel bauen.)
- [ ] **Implementierungsplan starten** (Skill: superpowers:writing-plans), danach
      subagent-getriebene Umsetzung mit regelmäßigen Pushes — wie beim Validator.

---

## Repos & Zustand (alles sauber, main == origin/main)

| Repo | Rolle | Stand |
|---|---|---|
| `ocf-repo` (spec) | Standard/Spec | main synchron; 3 offene Doc-PRs (#5/#6/#7) |
| `ocf-validator` | Referenz-Validator | **fertig & gemerged** (PR #1), Folge-PR #2 (alle 16 Codes) |
| `ocf-renderer` | **aktuelles Projekt** | Design committet (`a71774e`), README/LICENSE da; noch kein Code |

**Drei offene Spec-PRs (vom Renderer-Design aufgedeckt):**
- **#5** Defender-`rotation`-Konvention (0° = Arme nach −y, im Uhrzeigersinn)
- **#6** Distinct Positions / Mindest-Distanz (FIBA 0.5 m)
- **#7** `left_handed`/`right_handed` Tags + Ball-Seite-Render-Konvention

---

## Die getroffenen Design-Entscheidungen (Kurzfassung)

- **Stack/Umfang:** TypeScript → SVG. v1 = **Einzel-Frame-Standbild**; ein Drill →
  **Bildserie** (`renderFrames` → ein SVG je Frame). Kein Composite, keine
  Step-Nummern (v1.1). Keine Animation (später).
- **Court:** Stil „Soft / Modern“ (dezente Zone, blau-graue Akzente), per
  `color_scheme` überschreibbar. FIBA-Geometrie zuerst.
- **Symbole:** Offense = gefüllter Kreis + Nummer (2px weißer Stroke), Höhe ~30.
  Defense = FIBA-„Arme“-Glyph, **uniform** auf Höhe ~23 skaliert (Breite ~51 folgt
  dem Icon-Verhältnis, keine Verzerrung), **gerichtet via `rotation`**. Ball =
  oranger Punkt, Coach = „C“, Cone = Dreieck.
- **Trikotnummern:** 0–99, immer **aufrecht** (rotieren nicht mit dem Symbol).
- **Defender-Blickrichtung:** kommt **nur aus den `rotation`-Daten** — der Renderer
  rät nicht. Beispiel-/Testdaten müssen realistische Winkel verwenden.
- **Action-Notation:** move/cut = durchgezogen; **dribble = Sinus-Welle**
  (immer wellig — einziges Standbild-Merkmal ggü. Lauf); pass/hand_off =
  gestrichelt; screen = Endbalken ⊥ zur Tangente; **shoot = FIBA-Glyph am
  Werfer**, zum Korb gedreht.
- **Pfad-Architektur:** Basispfad (Catmull-Rom durch `moves`, **arc-length-
  reparametrisiert**) → Stil-Overlay → Endmarker an der **End-Tangente**.
- **Pfeil-Trimmen:** Pfeilspitzen enden **vor** dem Ziel-Symbol-Border (v.a. Pass).
- **Kurven:** Auto-glätten **mit Kollisionsvermeidung** — Pfade laufen **nie durch
  ein Symbol** (Spieler/Coach/Cone).
- **Überlappung:** Spec-Regel (#6, Mindest-Distanz) **+** Renderer-Sicherheitsnetz
  (residuales Berühren minimal auffächern; ändert keine Daten).
- **Ball-Position:** getragener Ball **versetzt** — „vorne“ = Richtung der
  Ball-Aktion, Seite = rechts (Default/`right_handed`) bzw. links (`left_handed`);
  loser Ball bleibt mittig. (Spec-PR #7.)

## Bewusst als Implementierungs-Detail offen gelassen (mit fixer Anforderung)

- **Dribbling auf kurzen/gebogenen Strecken:** Anforderung fix (immer wellig,
  feste Wellenlänge, kurz → **weniger** statt gequetschte Bögen, Amplitude an die
  Krümmung geklammert, ≥1–2 saubere Bögen). Genaue Konstanten → in der
  Implementierung mit **visuellen Snapshot-Tests** justieren. Fehlerbild
  (gequetscht/bulbous bei kurz+gebogen) ist reproduziert.
- **Ball-Offset-Maße:** Regel fix, genaue Distanz/Winkel-Mischung → Implementierung.

## Wichtige Lehre (im Design verankert)

Symbole & Geometrie **gegen gerenderte Bilder** prüfen, nicht gegen Bauchgefühl.
Hat in dieser Runde mehrere Fehler aufgedeckt (Defender-Orientierung; gequetschtes
Dribbling). Deshalb sind **visuelle Snapshot-Tests** fester Teil der Test-Strategie.

---

## Praktisches

- **Visual-Companion-Server** ist gestoppt. Neu starten (eine Zeile):
  ```bash
  bash ~/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.6/skills/brainstorming/scripts/start-server.sh --project-dir /Users/oliver-marcuseder/01-vibe-coding/00-Basektball/open-coaching-format
  ```
  Dann die ausgegebene `http://localhost:PORT` im Browser öffnen. (Wird fürs
  Design-Review aber nicht zwingend gebraucht — das Doc liest sich auch so.)
- **Wiederaufnahme:** Sag einfach „weiter mit dem Renderer“ oder „lass uns den
  Implementierungsplan machen“. Diese Datei (`RESUME.md`) hat den ganzen Kontext.

_Diese Datei kann nach Wiederaufnahme gelöscht werden._
