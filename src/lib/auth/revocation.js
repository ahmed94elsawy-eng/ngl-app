import { cacheProvider } from "../cache/init.js";
import { createRevocation } from "./revocation.core.js";

export const { revoke, isRevoked } = createRevocation(cacheProvider);