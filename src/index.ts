// Public library surface for the pkgcheck analysis engine.
//
// The engine (resolver -> fetcher -> signals -> scorer -> reporters) is built during
// implementation. This file exists so the package has a stable entry point and so the
// engine can be consumed as a library (by agents, a future GitHub Action, etc.) without
// a rewrite.

export const VERSION = "0.0.0";
