# Stage Contracts

| Stage | Schema File | Version | Producer | Consumer | Breaking Rules |
|---|---|---|---|---|---|
| recherche-signale | `research_output.schema.json` | 1.1.0 | Thema und Quellen sammeln | Beitrag aus Quellen erstellen | required/enum-Änderung, Feldentfernung |
| thema-pruefung | `topic_gate.schema.json` | 1.1.0 | Beitrag aus Quellen erstellen | Beitrag aus Quellen erstellen | required/enum-Änderung, Feldentfernung |
| kanal-linkedin | `linkedin_brief.schema.json` | 1.0.0 | Beitrag aus Quellen erstellen | Beitrag aus Quellen erstellen | required/enum-Änderung, Feldentfernung |
| kanal-reddit | `reddit_brief.schema.json` | 1.0.0 | Beitrag aus Quellen erstellen | Beitrag aus Quellen erstellen | required/enum-Änderung, Feldentfernung |
| entwurf-erstellung | `content_package.schema.json` | 1.1.0 | Beitrag aus Quellen erstellen | Ton-/Strategie-/Final-Gate | required/enum-Änderung, Feldentfernung |
| ton-kritik | `tone_critique.schema.json` | 1.1.0 | Beitrag aus Quellen erstellen | Finale-Kritik | required/enum-Änderung, Feldentfernung |
| strategie-kritik | `strategy_critique.schema.json` | 1.1.0 | Beitrag aus Quellen erstellen | Finale-Kritik | required/enum-Änderung, Feldentfernung |
| finale-kritik | `final_gate.schema.json` | 1.0.0 | Beitrag aus Quellen erstellen | Human Review / Persistenz | required/enum-Änderung, Feldentfernung |
| performance-auswertung | `performance_learnings.schema.json` | 1.1.0 | Performance zurueckfuehren | `Kontext/performance-memory.md`, Research, Content | required/enum-Änderung, Feldentfernung |

## Governance
- Authoring-SSOT: Obsidian `Workflow/Schemas`.
- Repo mirror: `local-files/_managed/schemas`.
- SSOT-Manifest Hash muss vor Run validiert werden.
- Legacy-Contracts sind nicht erlaubt.
- `performance_learnings` ist ein operativer Contract fuer kuratierte Rueckkopplung, nicht fuer einen separaten Eval-Layer.
