# FlightMonitor
Flight data monitor for Microsoft Flight Simulator 2020

This program reads flight status data via simvars and sends them to server periodically, which can be viewed from browsers.

The repository contains a .NET 8/SimConnect collector and a Node.js/Express web application.
See [Development setup](docs/DEVELOPMENT.md) and [Architecture](docs/ARCHITECTURE.md) for setup,
configuration, validation, and data-flow details. Automated coding agents should also read
[AGENTS.md](AGENTS.md) before making changes.
