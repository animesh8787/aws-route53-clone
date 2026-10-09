import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AWS_LOGO_DARK } from "@/lib/aws-logo";

import "./landing.css";

const BENEFITS = [
  {
    title: "Route users to your site with globally distributed DNS",
    text: "Hosted zones answer queries for your domains. Records for A, AAAA, CNAME, MX, TXT, NS, PTR, SRV and CAA are validated before they are saved, and every zone keeps its own SOA and NS records.",
  },
  {
    title: "Set up DNS routing in minutes",
    text: "Register a domain in three steps, create a hosted zone for it and add records from one editor that changes with the record type. Traffic Flow lets you design routing as a versioned policy.",
  },
  {
    title: "Customize routing to cut latency and keep applications available",
    text: "Pick simple, weighted, latency, failover, geolocation, multivalue or IP-based routing per record, and tie records to health checks so unhealthy endpoints stop receiving traffic.",
  },
  {
    title: "Keep control of your account",
    text: "Every account sees only its own zones, records and health checks. Sessions can be listed and ended, and passwords are checked as you type.",
  },
];

const USE_CASES = [
  { title: "Manage network traffic globally", text: "Combine latency, geolocation and weighted records to send each visitor to the best endpoint, and preview the answer with the built-in DNS test tool." },
  { title: "Build highly available applications", text: "Add health checks and failover records so a standby endpoint answers when the primary stops responding." },
  { title: "Set up private DNS", text: "Create private hosted zones, associate them with VPCs and forward queries with Resolver rules and endpoints." },
];

const SCENARIOS = [
  { tag: "Failover", title: "A shop keeps checkout online when its primary region fails", tone: "a" },
  { tag: "Weighted routing", title: "A media team shifts ten percent of traffic to a new release", tone: "b" },
  { tag: "Private DNS", title: "A platform team resolves internal names across several VPCs", tone: "c" },
];

const FAQS = [
  { q: "What is this site?", a: "An educational clone of the Amazon Route 53 console. Hosted zones, records, health checks and the rest behave like the console, but everything is simulated: nothing is registered, served or billed." },
  { q: "Can I try it without signing up?", a: "Yes. Sign in with demo@example.com and the password \"password\" to explore the sample data, or create an account to start with an empty one." },
  { q: "What is Amazon Q in the console?", a: "A chat panel that reads your own resources, explains DNS and Route 53, and walks you through changes with console steps, CLI commands or CloudFormation. It never changes anything itself." },
];

const FOOTER = [
  { head: "Learn", links: ["What is DNS?", "How routing policies work", "Health checks and failover", "DNS record types"] },
  { head: "Resources", links: ["Getting started", "Architecture overview", "API overview", "Database schema"] },
  { head: "Developers", links: ["Next.js frontend", "FastAPI backend", "SQLite storage", "Source on GitHub"] },
  { head: "Help", links: ["Contact us", "Known limitations", "Accessibility", "Terms"] },
];

function Accordion({ items }: { items: { title: string; text: string }[] }) {
  return (
    <div className="lp-acc">
      {items.map((i) => (
        <details key={i.title}>
          <summary>{i.title}</summary>
          <p>{i.text}</p>
        </details>
      ))}
    </div>
  );
}

export default async function Landing() {
  if ((await cookies()).has("r53_session")) redirect("/dashboard");
  return (
    <div className="lp" id="top">
      <div className="lp-util">
        <span>English ▾</span>
        <Link href="/login">Contact us</Link>
        <span>AWS Marketplace</span>
        <span>Support ▾</span>
        <Link href="/login">My account ▾</Link>
      </div>
      <header className="lp-nav">
        <div className="lp-nav-in">
          <Link href="/" className="lp-logo" aria-label="Amazon Route 53 home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={AWS_LOGO_DARK} alt="AWS" height={34} />
          </Link>
          <nav aria-label="Main">
            <a href="#how">Discover AWS</a>
            <a href="#benefits">Products</a>
            <a href="#use-cases">Solutions</a>
            <a href="#pricing">Pricing</a>
            <a href="#get-started">Resources</a>
          </nav>
          <div className="lp-nav-actions">
            <Link href="/login" className="lp-link">
              Sign in to console
            </Link>
            <Link href="/signup" className="lp-btn lp-btn-dark">
              Create account
            </Link>
          </div>
        </div>
      </header>

      <div className="lp-wash">
        <div className="lp-sub">
          <strong>Amazon Route 53</strong>
          <nav aria-label="Product">
            <a href="#top" className="on">Overview</a>
            <a href="#benefits">Features ▾</a>
            <a href="#pricing">Pricing</a>
            <a href="#get-started">Resources</a>
            <a href="#faq">FAQs</a>
          </nav>
        </div>

        <section className="lp-hero">
          <h1>Amazon Route 53 - DNS service</h1>
          <p>A reliable and cost-effective way to route end users to Internet applications.</p>
          <div className="lp-cta">
            <Link href="/signup" className="lp-btn lp-btn-dark lp-btn-lg">
              Get started with Route 53
            </Link>
            <Link href="/login" className="lp-btn lp-btn-ghost lp-btn-lg">
              Try the demo account
            </Link>
          </div>
        </section>
      </div>

      <section id="benefits" className="lp-split">
        <h2>Benefits of Route 53</h2>
        <div>
          <p className="lp-big">Route end users to your site reliably with globally distributed Domain Name System (DNS) servers and automatic scaling.</p>
          <Accordion items={BENEFITS} />
        </div>
      </section>

      <section id="how" className="lp-split">
        <h2>How it works</h2>
        <div className="lp-prose">
          <p>
            Amazon Route 53 provides highly available and scalable <a href="#benefits">Domain Name System (DNS)</a>, <a href="#benefits">domain name registration</a> and{" "}
            <a href="#benefits">health-checking</a> services. It translates names like example.com into the numeric IP addresses, such as 192.0.2.1, that computers use to connect to each other.
          </p>
          <p>
            Combine DNS with health checks to send traffic only to healthy endpoints, design routing with <a href="#use-cases">Traffic Flow</a>, and buy and manage domain names from the same place.
          </p>
          <p>
            In addition, <a href="#use-cases">Resolver</a> answers recursive queries for your VPCs, and <a href="#use-cases">DNS Firewall</a> lets you block known malicious domains and allow trusted ones.
          </p>
        </div>
      </section>

      <section id="use-cases" className="lp-split">
        <h2>Use cases</h2>
        <Accordion items={USE_CASES} />
      </section>

      <section id="customers" className="lp-split">
        <h2>Customers</h2>
        <div className="lp-stack" tabIndex={0} aria-label="Example scenarios, scroll to see more">
          {SCENARIOS.map((s) => (
            <article key={s.title} className={`lp-story lp-tone-${s.tone}`}>
              <span className="lp-story-tag">{s.tag}</span>
              <h3>{s.title}</h3>
              <Link href="/signup">Try it yourself →</Link>
            </article>
          ))}
        </div>
      </section>

      <section id="pricing" className="lp-split">
        <h2>Pricing</h2>
        <div className="lp-prose">
          <p>With Route 53 you pay for what you use: a monthly fee for each hosted zone, a small charge per million queries and a fee for each health check. This project computes the same kind of estimate from your own resources and labels it clearly as an estimate. Nothing is ever billed.</p>
          <Link href="/signup" className="lp-btn lp-btn-dark">
            Get started with Route 53
          </Link>
        </div>
      </section>

      <section id="get-started" className="lp-start">
        <h2>Get started</h2>
        <div className="lp-bento">
          <Link href="/signup" className="lp-tile lp-tile-big">
            <span className="lp-tile-tag">Product page</span>
            <b>Create an account and open the console</b>
            <i>→</i>
          </Link>
          <Link href="/login" className="lp-tile lp-tile-mid">
            <span className="lp-tile-tag">Demo</span>
            <b>Sign in with the sample data</b>
            <i>→</i>
          </Link>
          <Link href="/signup" className="lp-tile lp-tile-red">
            <span className="lp-tile-tag">Account</span>
            <b>Start with an empty account</b>
            <i>→</i>
          </Link>
        </div>
      </section>

      <section id="faq" className="lp-split">
        <h2>FAQs</h2>
        <Accordion items={FAQS.map((f) => ({ title: f.q, text: f.a }))} />
      </section>

      <div className="lp-feedback">
        <div>
          <b>Did you find what you were looking for today?</b>
          <span>Let us know so we can improve the quality of the content on our pages.</span>
        </div>
        <Link href="/login" className="lp-btn lp-btn-dark">Yes</Link>
        <Link href="/login" className="lp-btn lp-btn-dark">No</Link>
      </div>

      <footer className="lp-foot">
        <div className="lp-foot-top">
          <Link href="/signup" className="lp-btn lp-btn-light">Create an account</Link>
          <span className="lp-lang">English ▾</span>
        </div>
        <div className="lp-foot-cols">
          {FOOTER.map((c) => (
            <div key={c.head}>
              <h4>{c.head}</h4>
              <ul>
                {c.links.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <a href="#top" className="lp-top">Back to top ↑</a>
        <p>© 2026 Route 53 console clone. An educational project that imitates the AWS Route 53 console; it is not affiliated with Amazon Web Services and serves no real DNS.</p>
      </footer>
    </div>
  );
}
