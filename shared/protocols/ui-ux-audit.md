# UI/UX audit protocol

Ground the review in personas, jobs, flows, hierarchy, navigation, trust, device
priorities, and product constraints. Evaluate product fit, clarity, hierarchy,
consistency, responsiveness, accessibility, interaction, density, distinction,
and credibility. Inspect the real rendered product for post-build audits at
390x844, 768x1024, 1440x900, and 1920x1080 unless configuration says otherwise.

Judge against the kit's design principles (`global/skills/design-system/PRINCIPLES.md`
in the kit): calm and uncluttered, structure matching the audience (no
back-office look on public screens), layout chosen for the content, quiet
surfaces, typography carrying the personality, at most one meaningful signature
element, designed states, mobile-first. A clear breach is a CHALLENGE.

When the project has `design/`, audit against it: `layout.md` breakpoint
behavior, `components.md` states, `anti-patterns.md`, and `mocks/core.html` as
the intended rendering. Classify each material finding as `local` (one screen
off-spec, fix in the slice) or `systemic` (generic look, weak hierarchy,
inconsistent spacing, or a value/state/component missing from the system, fix in
design/ and the UI kit). A generic or inconsistent result is a CHALLENGE even
when every flow works.

Test interactions and states, not screenshots alone. Detect generic AI-generated
patterns only when they harm product goals. Score dimensions but let a single
critical usability/accessibility defect override the aggregate. Proposals must
remain isolated and carry audit attribution; never overwrite or merge the active
frontend.
