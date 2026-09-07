"""Synthetic transient tool outage; no package manager/network calls."""
import pathlib,sys
state=pathlib.Path(sys.argv[1])
if not state.exists():
 state.write_text('synthetic first attempt failed\n');print('SIMULATED TOOL FAILURE: temporary unavailability',file=sys.stderr);sys.exit(75)
print('SIMULATED TOOL RECOVERY');sys.exit(0)
