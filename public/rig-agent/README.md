# GYDS rig program

Runs on a server, PC or Android phone (Termux) and is controlled from the GYDS Miner dashboard.

## Requirements

- Node.js 18 or newer (the installer adds it if missing)
- The dashboard must be **published** — rigs can't reach the private preview address
- The default GYDS mining RPC is `https://netlifegy.com/api/mining/rpc`. It is protected by Cloudflare Access; add its service-token credentials under the profile's **Node endpoints** in the dashboard.
- For coins other than GYDS, install the mining program the profile uses and set its path in `.env`:

| Coin | Device | Mining program |
|------|--------|----------------|
| GYDS | CPU | built in |
| Monero (XMR) | CPU | XMRig or SRBMiner-MULTI |
| Ravencoin (RVN) | GPU | T-Rex (NVIDIA) or SRBMiner-MULTI (AMD) |
| Ethereum Classic (ETC) | GPU | lolMiner or T-Rex |
| Kaspa (KAS) | GPU / ASIC | lolMiner or SRBMiner-MULTI |
| Bitcoin (BTC) | ASIC | CGMiner (USB ASICs) |

## Install

Use the one-line command from the dashboard's **Add rig** screen. It downloads `agent.mjs`, writes `.env`,
and sets the program to start on boot and restart if it stops:

- Linux: systemd service `gyds-rig` (`journalctl -u gyds-rig -f` for logs)
- macOS: launchd `com.gyds.rig`
- Windows: scheduled task "GYDS Rig"
- Termux: background loop + Termux:Boot script

## Behaviour

- **Runs until you stop it.** Mining continues through dashboard outages (last settings are saved in `state.json`), crashes and reboots. Only the dashboard's Stop button stops mining.
- **Auto-detects hardware** — CPU model/cores/RAM and NVIDIA (nvidia-smi), AMD (rocm-smi / lspci), Intel and Apple GPUs.
- **Updates** — when a newer version is published the dashboard shows *Update available*; press **Update**, or set `AUTO_UPDATE=true` in `.env`.
- **GPU overclock** is off unless `ALLOW_GPU_OC=true`.
