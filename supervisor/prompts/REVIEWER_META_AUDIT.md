# Reviewer meta-audit assignment

Evaluate whether the Claude reviewer actually inspected the relevant diff,
requirements, security boundaries, and test output. Reproduce a bounded sample
of important claims. Look specifically for false PASS conclusions, omitted
authorization/validation checks, ignored failures, and tests that only confirm
mocks. Audit the review quality; do not duplicate every stylistic comment.
