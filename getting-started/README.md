# Getting started · Hack the Andes 2026

Team reference document. Sources reviewed on **October 17, 2026**.

## The event

[Hack the Andes](https://hacktheandes.com/) brings together 100 participants in
Lima, Peru, on **October 17–18, 2026**, for **30 hours** of building. Teams have
**1 to 4 members**. The goal is to solve a real problem in Peru with a product
people can use and demonstrate. Crafter Station organizes the event, with Chofex
as the main sponsor and Peru Tech Week as a partner.

The operational reference is the [official team guide](https://hacktheandes.com/guide).

## Chosen track

**Climate and Territory — `environmental`**, as selected by the team. Its scope
includes water, frost, debris flows, rainfall, agriculture, and pest alerts. The
track selection saved on the platform has not yet been checked.

The other tracks are Mobility and Transportation (`transport`), School Education
(`education`), and Security (`security`). Track names here are English
translations; CLI identifiers remain unchanged.

## Current rubric for this team

**Source: update provided by the participant on October 17, 2026.** The guide
reviewed that day still showed the previous three criteria: 30% traction, 40%
technical effort, and 30% pitch. We use the following five-criterion update to
prepare the project. We do not carry over the previous scoring scale or formula;
the current scale still needs confirmation from the organizers.

| Weight | Area | Criterion | What is assessed |
| --- | --- | --- | --- |
| 30% | Technical | Technical complexity | Integrations, data, models, and architecture. |
| 25% | Technical | Functionality | A complete live workflow accessible from the public URL. |
| 20% | Technical | Technical quality | Judges review the GitHub repository. |
| 15% | Product | Problem and impact | A real user within the chosen track. |
| 10% | Product | Clarity | Explanation of decisions and tradeoffs. |
| **100%** | | **Total** | **75% technical and 25% product.** |

### Turning the rubric into work

These are internal preparation recommendations, not additional requirements
attributed to the organizers:

- **Complexity:** map the data flow, justify integrations and models, identify
  what creates value, and document limitations.
- **Functionality:** prioritize a complete workflow, test it in a fresh session,
  and record the URL and outcome. Make recoverable errors visible.
- **Quality:** maintain setup instructions, sample configuration, a clear
  structure, and appropriate checks for critical workflows.
- **Impact:** identify a specific person within the track, their current problem,
  and the action they need to complete. Record real evidence and lessons learned.
- **Clarity:** explain decisions, rejected alternatives, limitations, and what the
  demo covers. Distinguish implemented features from future plans.

## Submission and presentation

The [official guide](https://hacktheandes.com/guide) requires a deployed
application, a presentation, the GitHub repository, and a Markdown description.
The project uses the team name. You can submit early and edit later. The
organizers use their own computer: check links without an existing login or
pending access requests. The pitch lasts **3 minutes**, followed by **2 minutes
of questions**. When evaluation opens, the submission and progress history are
captured; later edits do not update that snapshot.

Also review the [submission and presentation terms](https://hacktheandes.com/participation-terms)
before submitting; this document does not replace those terms.

### Internal preparation checklist

- [ ] Define the user, geographic area, and priority problem within `environmental`.
- [ ] Scope the main action and what will be excluded from the MVP.
- [ ] Verify the availability, provenance, and limitations of the chosen data.
- [ ] Complete and test the main workflow from the public URL.
- [ ] Document setup, configuration, architecture, and decisions in the repository.
- [ ] Gather verifiable evidence with a real user within the track.
- [ ] Prepare the presentation and rehearse the demo within the allotted time.
- [ ] Check application and presentation access in a private browsing session.
- [ ] Submit all four deliverables and verify what the server saved.

## The `andes` CLI

The **v0.1.279** installation and the availability of `team`, `project`,
`project update`, `project updates`, and `project submit` were checked during
initial preparation. The account was not queried, the team was not modified,
and no update was published as part of that preparation.

Run these read commands from the repository root:

```sh
andes --output json team
andes --output json project
andes --output json project updates
```

To publish an update when authorized by the team, create a file containing the
new summary using [the template](PROGRESS_TEMPLATE.md), replace its placeholders,
and run, for example:

```sh
andes --output json project update --file ./getting-started/update-to-publish.md
```

Then verify the saved content. Do not send an unfilled template or repeatedly
publish the entire log. The history may become public.

## Working documents

- [Team Plan](../docs/team-plan.md): the chosen product direction and full MVP
  scope, with the current rubric and a 30-hour implementation schedule.
- [PROGRESS.md](PROGRESS.md): local history of decisions, implementation, checks,
  blockers, and next steps, with one short paragraph per update.
- [PROGRESS_TEMPLATE.md](PROGRESS_TEMPLATE.md): a template for a 2-to-4-sentence
  update for mentors and judges.
- [AGENTS.md](../AGENTS.md): instructions for agents to update the log during
  their sessions. There is no background logging service.

## Initial state

The repository was empty when preparation began. The team chose `environmental`
and has since added a Team Plan for WhatsApp hazard reporting on the Carretera
Central. The participant chose to retain its original approach and full MVP
scope, with the rubric and schedule updated. User validation, team name,
integrations, data access, demo, and presentation remain pending; the plan does
not establish that these have been completed.

All future work and documentation will be in English. Public sources may change;
keep the review date and record any new guidance from the organizers or the
participant in the progress log.
