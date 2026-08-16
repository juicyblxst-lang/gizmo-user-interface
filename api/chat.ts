const BACKEND_URL = process.env["GIZMO_BACKEND_URL"];
const API_KEY = process.env["AI_GATEWAY_API_KEY"];
const MODEL = "google/gemini-3.6-flash";
const PAIRS = ["BTC", "ETH", "SOL", "XRP", "DOGE", "HYPE"] as const;
type Symbol = (typeof PAIRS)[number];

const SYSTEM = `You are GIZMO, a trading intelligence agent. Be concise, natural, technical and calm. Never hype.
GIZMO covers BTC, ETH, SOL, XRP, DOGE and HYPE.
The supplied