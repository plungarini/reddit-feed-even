#!/usr/bin/env node
import { networkInterfaces } from "os";
import { execSync } from "child_process";

const ip = Object.values(networkInterfaces())
  .flat()
  .find((i) => i.family === "IPv4" && !i.internal)?.address;

if (!ip) {
  console.error("no LAN IP found");
  process.exit(1);
}

const port = 5173;
const url = `http://${ip}:${port}`;

console.log(`running: evenhub qr --url ${url}`);
execSync(`evenhub qr --url ${url}`, { stdio: "inherit" });
