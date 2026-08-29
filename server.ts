import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";
import Stripe from "stripe";
import cors from "cors";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { CREDIT_COSTS, DAILY_FREE_CREDITS } from "./credits";

dotenv.config({ override: true });

const PORT = Number(process.env.PORT) || 3000;

/**
 * The language a visitor starts in, for running one instance per market.
 *
 * Only a default: a saved choice in the browser still wins, and the language
 * switcher is untouched. Two instances on two ports are two origins, so each
 * keeps its own saved choice rather than fighting over one.
 */
const DEFAULT_LANG = (process.env.DEFAULT_LANG || "en").trim();
const isDev = process.env.NODE_ENV !== "production";

// Emails that get unlimited credits. Configured out-of-band, and matched
// against the email inside a *verified* JWT — never against a client payload.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * How many credits each Stripe price grants.
 *
 * Read from the environment rather than committed. A price id is not a secret,
 * but it names a live Stripe account's products, differs between test and live
 * mode, and publishes the pricing structure to anyone reading the repository.
 * Keeping it out means one codebase can serve a test account and a live one.
 */
const PRICE_CREDITS: Record<string, number> = Object.fromEntries(
  (process.env.STRIPE_PRICE_CREDITS || "")
    .split(",")
    .map((pair) => pair.split(":").map((x) => x.trim()))
    .filter(([id, credits]) => id && Number(credits) > 0)
    .map(([id, credits]) => [id, Number(credits)])
);

// --- Lazy clients ------------------------------------------------------------

let stripeClient: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY?.trim();
    if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
    if (key.startsWith("rk_")) {
      throw new Error(
        'STRIPE_SECRET_KEY is a Restricted Key ("rk_"). Use the Secret key ("sk_").'
      );
    }
    stripeClient = new Stripe(key, { apiVersion: "2024-06-20" as any });
  }
  return stripeClient;
}

let supabaseAdmin: SupabaseClient | null = null;
function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "Supabase admin is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
      );
    }
    supabaseAdmin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabaseAdmin;
}

// --- Types -------------------------------------------------------------------

interface AuthedUser {
  id: string;
  email: string;
  isAdmin: boolean;
}
type AuthedRequest = express.Request & { user?: AuthedUser };

// --- Credits -----------------------------------------------------------------

async function getBalance(user: AuthedUser): Promise<number> {
  if (user.isAdmin) return Number.POSITIVE_INFINITY;
  const { data, error } = await getSupabaseAdmin()
    .from("user_credits")
    .select("credits")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data?.credits ?? 0;
}

// --- Bootstrap ---------------------------------------------------------------

async function startServer() {
  const app = express();

  console.log("Initializing server components...");
  console.log("Environment:", isDev ? "development" : "production");

  // Same-origin by default. Extra origins must be listed explicitly rather
  // than allowing `*`, which let any site on the internet call these endpoints.
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (allowedOrigins.length > 0) {
    app.use(cors({ origin: allowedOrigins, credentials: true }));
  }

  // ---------------------------------------------------------------------------
  // Stripe webhook.
  //
  // Registered BEFORE express.json(). Signature verification hashes the exact
  // bytes Stripe sent, so the body must still be a Buffer here — a global JSON
  // parser upstream would consume it and every webhook would fail verification.
  // ---------------------------------------------------------------------------
  app.post(
    "/api/webhook",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!secret) {
        // No fallback to unsigned parsing: that would let anyone POST a fake
        // "payment succeeded" event and mint themselves credits.
        console.error("STRIPE_WEBHOOK_SECRET is not configured; rejecting webhook.");
        return res.status(500).send("Webhook secret not configured");
      }

      const stripe = getStripe();
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(
          req.body,
          req.headers["stripe-signature"] as string,
          secret
        );
      } catch (err: any) {
        console.error("Webhook signature verification failed:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      try {
        if (
          event.type === "checkout.session.completed" ||
          event.type === "invoice.paid"
        ) {
          const object = event.data.object as any;
          const customerId = object.customer as string | null;

          let priceId = "";
          if (event.type === "checkout.session.completed") {
            const lineItems = await stripe.checkout.sessions.listLineItems(object.id);
            priceId = lineItems.data[0]?.price?.id || "";
          } else {
            priceId = object.lines?.data?.[0]?.price?.id || "";
          }

          const creditsToAdd = PRICE_CREDITS[priceId] ?? 0;

          if (customerId && creditsToAdd > 0) {
            const customer = (await stripe.customers.retrieve(
              customerId
            )) as Stripe.Customer;
            const userId = customer.metadata?.userId;

            if (!userId) {
              console.error(
                `Paid event for customer ${customerId} has no userId in metadata; cannot credit.`
              );
            } else {
              const { error } = await getSupabaseAdmin().rpc("add_credits", {
                p_user_id: userId,
                p_amount: creditsToAdd,
              });
              if (error) throw error;
              console.log(`Added ${creditsToAdd} credits to user ${userId}`);
            }
          }
        }
      } catch (err) {
        console.error("Error processing webhook:", err);
        // 500 so Stripe retries rather than dropping a paid event on the floor.
        return res.status(500).json({ error: "Webhook processing failed" });
      }

      res.json({ received: true });
    }
  );

  app.use(express.json({ limit: "25mb" }));

  app.use((req, _res, next) => {
    if (req.path.startsWith("/api/")) {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    }
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ---------------------------------------------------------------------------
  // Authentication.
  //
  // Identity comes from a Supabase JWT that the server verifies. It is never
  // taken from the request body: the previous version trusted a client-supplied
  // `email`, so anyone could pass an admin address and receive infinite credits.
  // ---------------------------------------------------------------------------
  const requireAuth: express.RequestHandler = async (req: AuthedRequest, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Not authenticated" });

    try {
      const { data, error } = await getSupabaseAdmin().auth.getUser(token);
      if (error || !data.user?.email) {
        return res.status(401).json({ error: "Invalid or expired session" });
      }
      const email = data.user.email.toLowerCase();
      req.user = { id: data.user.id, email, isAdmin: ADMIN_EMAILS.includes(email) };
      next();
    } catch (err: any) {
      console.error("Auth check failed:", err.message);
      res.status(503).json({ error: "Authentication service unavailable" });
    }
  };

  // ---------------------------------------------------------------------------
  // Credits
  // ---------------------------------------------------------------------------
  app.get("/api/user-stats", requireAuth, async (req: AuthedRequest, res) => {
    const user = req.user!;
    try {
      if (user.isAdmin) {
        return res.json({ credits: 999999, isInfinite: true, bonusApplied: false });
      }

      const { data, error } = await getSupabaseAdmin()
        .rpc("claim_daily_bonus", {
          p_user_id: user.id,
          p_floor: DAILY_FREE_CREDITS,
        })
        .single<{ credits: number; bonus_applied: boolean }>();

      if (error) throw error;

      res.json({
        credits: data?.credits ?? 0,
        isInfinite: false,
        bonusApplied: !!data?.bonus_applied,
      });
    } catch (error: any) {
      console.error("Credits error:", error);
      res.status(500).json({ error: "Could not load your credit balance" });
    }
  });

  app.post("/api/deduct", requireAuth, async (req: AuthedRequest, res) => {
    const user = req.user!;
    const amount = Number(req.body?.amount);

    if (!Number.isInteger(amount) || amount <= 0 || amount > 100) {
      return res.status(400).json({ error: "Invalid amount" });
    }
    if (user.isAdmin) {
      return res.json({ success: true, remaining: 999999, isInfinite: true });
    }

    try {
      const { data, error } = await getSupabaseAdmin().rpc("deduct_credits", {
        p_user_id: user.id,
        p_amount: amount,
      });

      if (error) {
        if (error.message?.includes("INSUFFICIENT_CREDITS")) {
          return res.status(402).json({ error: "Insufficient credits" });
        }
        throw error;
      }

      res.json({ success: true, remaining: data as number });
    } catch (error: any) {
      console.error("Deduct error:", error);
      res.status(500).json({ error: "Could not update your credit balance" });
    }
  });

  // ---------------------------------------------------------------------------
  // Gemini proxy.
  //
  // Authenticated and balance-gated: without this, anyone on the internet could
  // use this endpoint as a free Gemini relay billed to our API key. Errors are
  // returned as errors — the previous version answered a revoked key with a
  // fake success payload, which the UI then rendered as if it were the user's
  // real analysis, after charging them for it.
  // ---------------------------------------------------------------------------
  app.post("/api/gemini", requireAuth, async (req: AuthedRequest, res) => {
    const user = req.user!;
    try {
      const balance = await getBalance(user);
      if (balance <= 0) {
        return res.status(402).json({ error: "Insufficient credits" });
      }

      const apiKey = process.env.GEMINI_API_KEY?.trim();
      if (!apiKey) {
        console.error("GEMINI_API_KEY is not configured.");
        return res.status(503).json({ error: "AI service is not configured" });
      }

      const { method, model, contents, config } = req.body ?? {};
      if (method !== "generateContent") {
        return res.status(400).json({ error: `Method ${method} not supported` });
      }

      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(apiKey);
      const genModel = genAI.getGenerativeModel({
        model: model || "gemini-flash-latest",
        systemInstruction: config?.systemInstruction
          ? String(config.systemInstruction)
          : undefined,
      });

      const normalisePart = (p: any) =>
        p?.inlineData
          ? { inlineData: { mimeType: p.inlineData.mimeType, data: p.inlineData.data } }
          : p;

      const formattedContents = Array.isArray(contents)
        ? contents.map((c: any) => ({
            role: c.role || "user",
            parts: (Array.isArray(c.parts) ? c.parts : [{ text: String(c.parts) }]).map(
              normalisePart
            ),
          }))
        : [
            {
              role: "user",
              parts: (contents?.parts || [{ text: String(contents) }]).map(normalisePart),
            },
          ];

      const result = await genModel.generateContent({
        contents: formattedContents,
        generationConfig: {
          responseMimeType: config?.responseMimeType,
          responseSchema: config?.responseSchema,
        },
      });

      const response = await result.response;
      res.json({
        text: response.text(),
        candidates: response.candidates,
        promptFeedback: response.promptFeedback,
        usageMetadata: response.usageMetadata,
      });
    } catch (error: any) {
      console.error("[Gemini Proxy] Error:", error?.message || error);

      const status = error?.status;
      if (status === 403) {
        return res.status(503).json({
          error:
            "The AI service rejected our API key. Nothing was charged — please try again later.",
        });
      }
      if (status === 429) {
        return res.status(429).json({ error: "AI service is rate limited. Please retry shortly." });
      }
      res.status(502).json({ error: "The AI service failed to respond. Please try again." });
    }
  });

  // ---------------------------------------------------------------------------
  // Billing
  // ---------------------------------------------------------------------------
  async function getOrCreateCustomer(user: AuthedUser): Promise<Stripe.Customer> {
    const stripe = getStripe();
    const existing = await stripe.customers.list({ email: user.email, limit: 1 });
    if (existing.data.length > 0) {
      const customer = existing.data[0];
      // Older customers were created without a userId; backfill so the webhook
      // can map a payment back to an account.
      if (customer.metadata?.userId !== user.id) {
        return await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, userId: user.id },
        });
      }
      return customer;
    }
    return await stripe.customers.create({
      email: user.email,
      metadata: { userId: user.id },
    });
  }

  /** Only allow redirects back to this deployment. */
  function safeReturnUrl(req: express.Request, candidate: unknown): string {
    const origin = `${req.protocol}://${req.get("host")}`;
    if (typeof candidate === "string") {
      try {
        const url = new URL(candidate);
        if (url.origin === origin) return url.toString();
      } catch {
        /* fall through */
      }
    }
    return origin;
  }

  app.post("/api/checkout", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const { priceId } = req.body ?? {};
      if (!priceId || !PRICE_CREDITS[priceId]) {
        return res.status(400).json({ error: "Unknown plan" });
      }

      const stripe = getStripe();
      const customer = await getOrCreateCustomer(req.user!);
      const returnUrl = safeReturnUrl(req, req.body?.returnUrl);

      const session = await stripe.checkout.sessions.create({
        customer: customer.id,
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: "subscription",
        success_url: `${returnUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: returnUrl,
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Checkout error:", error);
      const message =
        error.type === "StripeAuthenticationError"
          ? "Payments are misconfigured. Please contact support."
          : "Could not start checkout. Please try again.";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/create-portal-session", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const stripe = getStripe();
      const customer = await getOrCreateCustomer(req.user!);
      const session = await stripe.billingPortal.sessions.create({
        customer: customer.id,
        return_url: safeReturnUrl(req, req.body?.returnUrl),
      });
      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Portal error:", error);
      res.status(500).json({ error: "Could not open the billing portal." });
    }
  });

  // Unmatched API routes must not fall through to the SPA and return HTML.
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
  });

  // OAuth bounce: Supabase redirects here, we hand the code back to the SPA,
  // where supabase-js (detectSessionInUrl) completes the exchange.
  app.get(["/auth/callback", "/auth/callback/"], (req, res) => {
    const query = req.originalUrl.includes("?")
      ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
      : "";
    res.redirect(302, `/${query}`);
  });

  /* Injected rather than baked at build time, so one build serves every
     market and the language is a deploy setting, not a separate artifact. */
  const injectLang = (html: string) =>
    html.replace(
      "<head>",
      `<head><script>window.__DEFAULT_LANG__=${JSON.stringify(DEFAULT_LANG)}</script>`
    );

  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom",
    });
    app.use(vite.middlewares);
    app.use("*", async (req, res, next) => {
      try {
        const raw = await fs.promises.readFile(
          path.join(process.cwd(), "index.html"),
          "utf-8"
        );
        const html = await vite.transformIndexHtml(req.originalUrl, raw);
        res.status(200).set({ "Content-Type": "text/html" }).end(injectLang(html));
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
    console.log("Vite middleware attached.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath, { index: false }));
    app.get("*", async (_req, res) => {
      const html = await fs.promises.readFile(path.join(distPath, "index.html"), "utf-8");
      res.status(200).set({ "Content-Type": "text/html" }).end(injectLang(html));
    });
  }

  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Unhandled Error:", err);
    if (req.path.startsWith("/api/")) {
      return res.status(500).json({ error: "Internal Server Error" });
    }
    next(err);
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`> Server is listening on port ${PORT}`);
    console.log(`> Credit costs:`, CREDIT_COSTS);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
