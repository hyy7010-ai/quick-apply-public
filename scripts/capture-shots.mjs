import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2];
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const RATIO = 476 / 336; // the hero card's body slot

const MODULES = [
  {
    id: 'agent',
    nav: { en: 'CAREER AGENT', zh: 'CAREER AGENT' },
    vw: 900, vh: 1400,
    // Crop to the third demo job, the one scored 18 and marked skip. The
    // whole argument is that the product will tell you not to apply, so a
    // screenshot of a 96% "priority apply" would sell the opposite thing.
    clip: () => {
      const h = [...document.querySelectorAll('*')].filter(
        (e) => e.children.length === 0 && e.textContent.trim() === 'Senior iOS Engineer'
      ).sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
      const list = h.closest('div[class*="rounded"]').parentElement.getBoundingClientRect();
      const r = h.getBoundingClientRect();
      return { x: list.left - 8 + scrollX, y: r.top - 34 + scrollY, width: list.width + 16 };
    },
    scrollTo: 'Senior iOS Engineer',
  },
  {
    // Reached through the Career Agent: the editor only opens with a resume
    // already in it, and the demo's tailored version is that resume.
    id: 'resume',
    nav: { en: 'CAREER AGENT', zh: 'CAREER AGENT' },
    then: { en: 'Open', zh: '打开' },
    vw: 1280, vh: 1000,
    clip: () => {
      const h = document.querySelector('header');
      return { x: scrollX, y: (h ? h.getBoundingClientRect().bottom : 80) + scrollY, width: innerWidth };
    },
  },
  {
    id: 'career',
    nav: { en: 'Career Path', zh: '职业路径' },
    vw: 1280, vh: 1300,
    // Start below the example banner: it is a sign-in prompt, not the module.
    clip: () => {
      const h = [...document.querySelectorAll('h1')].find((e) => e.textContent.includes('Graduate'));
      const top = h.closest('div[class*="max-w-[1600px]"]').getBoundingClientRect().top;
      return { x: scrollX, y: top + scrollY, width: innerWidth };
    },
  },
  {
    id: 'interview',
    nav: { en: 'Interview', zh: '面试训练' },
    vw: 1120, vh: 900,
    clip: () => {
      const h = document.querySelector('header');
      return { x: scrollX, y: (h ? h.getBoundingClientRect().bottom : 80) + scrollY, width: innerWidth };
    },
  },
  {
    id: 'portfolio',
    nav: { en: 'Portfolio AI', zh: '作品集 AI' },
    vw: 1120, vh: 900,
    clip: () => {
      const h = document.querySelector('header');
      return { x: scrollX, y: (h ? h.getBoundingClientRect().bottom : 80) + scrollY, width: innerWidth };
    },
  },
];

mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--hide-scrollbars'],
});

for (const lang of ['en', 'zh']) {
  for (const m of MODULES) {
    const page = await browser.newPage();
    await page.setViewport({ width: m.vw, height: m.vh, deviceScaleFactor: 2 });
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle2' });
    await page.evaluate((l) => localStorage.setItem('lang', l), lang);
    await page.reload({ waitUntil: 'networkidle2' });

    const label = m.nav[lang];
    const ok = await page.evaluate((txt) => {
      const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === txt);
      if (!b) return false;
      b.click();
      return true;
    }, label);
    if (!ok) { console.log(`MISS ${m.id}/${lang}`); await page.close(); continue; }

    await new Promise((r) => setTimeout(r, 3500));

    if (m.then) {
      const label = m.then[lang];
      const went = await page.evaluate((txt) => {
        const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === txt);
        if (!b) return false;
        b.click();
        return true;
      }, label);
      if (!went) { console.log(`MISS ${m.id}/${lang}: no "${label}" button`); await page.close(); continue; }
      await new Promise((r) => setTimeout(r, 2500));
    }

    if (m.scrollTo) {
      await page.evaluate((txt) => {
        const h = [...document.querySelectorAll('*')].filter(
          (e) => e.children.length === 0 && e.textContent.trim() === txt
        ).sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
        h?.scrollIntoView({ block: 'start' });
      }, m.scrollTo);
      await new Promise((r) => setTimeout(r, 900));
    }

    await page.evaluate(() => {
      // Any narrow fixed strip pinned to the right edge is a site rail
      // (History, Saved Plans), not part of the module being photographed.
      const labels = ['HISTORY', '历史记录', 'SAVED PLANS', '已保存方案'];
      for (const el of document.querySelectorAll('*')) {
        if (el.children.length || !labels.includes(el.textContent.trim())) continue;
        let n = el;
        while (n && n !== document.body && getComputedStyle(n).position === 'static') n = n.parentElement;
        (n && n !== document.body ? n : el).style.display = 'none';
      }
      for (const el of document.querySelectorAll('*')) {
        const st = getComputedStyle(el);
        if (st.position !== 'fixed' && st.position !== 'sticky') continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.width < 140 && r.right >= innerWidth - 4) el.style.display = 'none';
      }
    });


    const box = await page.evaluate(m.clip);
    const clip = {
      x: Math.max(0, Math.round(box.x)),
      y: Math.max(0, Math.round(box.y)),
      width: Math.round(box.width),
      height: Math.round(box.width / RATIO),
    };
    await page.screenshot({ path: `${OUT}/${m.id}-${lang}.png`, clip });
    console.log(`OK   ${m.id}/${lang}  ${clip.width}x${clip.height} @ ${clip.x},${clip.y}`);
    await page.close();
  }
}
await browser.close();

/*
 * Regenerates the hero screenshots in public/shots.
 *
 * Needs the dev server on :3000 and puppeteer-core, which is deliberately NOT a
 * dependency of this project: it is only needed to rebuild these eight images.
 *
 *   npm i -g puppeteer-core   # or install it in a scratch directory
 *   node scripts/capture-shots.mjs ./public/shots-raw
 *   # then downscale to 1000px wide and convert to JPEG q82
 *
 * Run it whenever the Career Agent, Career Path, Interview or Portfolio screens
 * change. A stale photograph of the product is worse than no photograph.
 */
