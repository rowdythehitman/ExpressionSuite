// @include './lib/json2.js'

import { ns } from "../shared/shared";
import type { HostApi } from "../shared/host-api";
import * as ide from "./aeft/ide";

// After Effects only (cep.config.ts). Each Suite tool adds its host functions to this namespace.
const api: HostApi = ide;
($ as any)[ns] = api;
