/**
 * Flat pastel agent mascots (inline SVG).
 * Motifs are job-themed; only Auth uses a worried face when unhealthy.
 */

/** @typedef {'sm' | 'md' | 'lg'} MascotSize */
/** @typedef {'cheerful' | 'worried'} MascotMood */

/**
 * @param {string | null | undefined} status
 * @returns {MascotMood}
 */
export function moodForStatus(status) {
  return status === 'critical' || status === 'degraded' || status === 'in_hospital'
    ? 'worried'
    : 'cheerful'
}

/**
 * @param {string} agentId
 * @param {{ size?: MascotSize, mood?: MascotMood, title?: string }} [opts]
 */
export function agentCharacter(agentId, opts = {}) {
  const size = opts.size ?? 'md'
  const mood = opts.mood ?? 'cheerful'
  const wrap = document.createElement('span')
  wrap.className = `agent-mascot agent-mascot--${size}`
  wrap.setAttribute('aria-hidden', 'true')
  if (opts.title) wrap.title = opts.title
  wrap.innerHTML = svgMarkup(agentId, mood)
  return wrap
}

/**
 * @param {string} agentId
 * @param {MascotMood} mood
 */
function svgMarkup(agentId, mood) {
  const builders = {
    auth: authSvg,
    appy: appySvg,
    test: testSvg,
    research: researchSvg,
    frontend: frontendSvg,
    data: dataSvg,
    ops: opsSvg,
    kitty: kittySvg,
    gitty: kittySvg,
    uma: umaSvg,
  }
  const build = builders[agentId] ?? fallbackSvg
  return build(mood)
}

function face(mood, { cx = 40, cy = 36, eyeY = 34, mouthY = 46 } = {}) {
  // Sticker-style: solid dot eyes + simple smile (Uma covers inspo).
  if (mood === 'worried') {
    return `
      <circle cx="${cx - 7}" cy="${eyeY}" r="3.2" fill="#1f2a37"/>
      <circle cx="${cx + 7}" cy="${eyeY}" r="3.2" fill="#1f2a37"/>
      <path d="M${cx - 7} ${mouthY + 2} q 7 -6 14 0" fill="none" stroke="#1f2a37" stroke-width="2.4" stroke-linecap="round"/>
    `
  }
  return `
    <circle cx="${cx - 7}" cy="${eyeY}" r="3.4" fill="#1f2a37"/>
    <circle cx="${cx + 7}" cy="${eyeY}" r="3.4" fill="#1f2a37"/>
    <path d="M${cx - 7} ${mouthY} q 7 8 14 0" fill="none" stroke="#1f2a37" stroke-width="2.4" stroke-linecap="round"/>
  `
}

function littleFeet() {
  return `
    <ellipse cx="32" cy="72" rx="5" ry="3.2" fill="#1f2a37"/>
    <ellipse cx="48" cy="72" rx="5" ry="3.2" fill="#1f2a37"/>
  `
}

function frame(bg, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="100%" height="100%" role="img" focusable="false">
  <rect width="80" height="80" rx="22" fill="${bg}" stroke="#1f2a37" stroke-width="3"/>
  ${body}
</svg>`
}

/** Auth — shield + key, amber. Worried when unhealthy. */
function authSvg(mood) {
  return frame(
    '#fff0d6',
    `
    <path d="M40 14c8 4 16 5 20 6v18c0 14-10 24-20 28-10-4-20-14-20-28V20c4-1 12-2 20-6z" fill="#f2c14e"/>
    <path d="M40 20c6 3 12 4 15 4.5v14c0 10-7.5 17.5-15 20.5-7.5-3-15-10.5-15-20.5V24.5C28 24 34 23 40 20z" fill="#f6d978"/>
    ${face(mood, { cy: 38, eyeY: 36, mouthY: 48 })}
    <g fill="none" stroke="#2a2d36" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 52c4 2 8 8 10 14"/>
      <path d="M62 52c-3 3-6 9-7 14"/>
      <path d="M28 58h-6l-2 3h4"/>
      <path d="M52 58h6l2 3h-4"/>
      <circle cx="58" cy="28" r="4.5" fill="#e8f0ff" stroke="#2a2d36"/>
      <path d="M58 32.5v10"/>
      <path d="M58 38h3M58 41h2.5"/>
    </g>
  `,
  )
}

/** Appy — soft phone squircle, coral pink. */
function appySvg(mood) {
  return frame(
    '#ffe4ef',
    `
    <rect x="26" y="14" width="28" height="48" rx="8" fill="#f48fb1"/>
    <rect x="30" y="20" width="20" height="32" rx="3" fill="#fff7fb"/>
    <rect x="36" y="55" width="8" height="3" rx="1.5" fill="#fff7fb"/>
    ${face(mood, { cy: 36, eyeY: 34, mouthY: 46 })}
    <g fill="none" stroke="#2a2d36" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M26 44c-5 2-8 0-10-4"/>
      <path d="M54 30c5-1 9 2 10 7"/>
      <path d="M16 40c1 2 2 3 4 3"/>
      <path d="M64 37c-1 2-2 3-3 3.5"/>
      <path d="M34 62v6l-3 2"/>
      <path d="M46 62v6l3 2"/>
    </g>
    <circle cx="58" cy="22" r="2" fill="#ffd54f"/>
  `,
  )
}

/** Test — mint clipboard with check. */
function testSvg(mood) {
  return frame(
    '#e6f7ef',
    `
    <rect x="22" y="18" width="36" height="44" rx="6" fill="#7dcea0"/>
    <rect x="26" y="24" width="28" height="32" rx="3" fill="#f4fff8"/>
    <rect x="32" y="14" width="16" height="8" rx="3" fill="#f9e79f"/>
    <path d="M34 40l5 5 10-11" fill="none" stroke="#2ecc71" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    ${face(mood, { cy: 34, eyeY: 32, mouthY: 44 })}
    <g fill="none" stroke="#2a2d36" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 48c-5 1-8-1-10-5"/>
      <path d="M58 48c5 1 8-1 10-5"/>
      <path d="M12 43c1 2 2 3 3.5 3.5"/>
      <path d="M68 43c-1 2-2 3-3.5 3.5"/>
      <path d="M32 62v6l-3 2"/>
      <path d="M48 62v6l3 2"/>
    </g>
  `,
  )
}

/** Research — lavender blob + magnifying glass. */
function researchSvg(mood) {
  return frame(
    '#efe8ff',
    `
    <path d="M24 28c0-10 8-16 16-16s16 6 16 16c4 2 6 8 4 14-2 8-10 14-20 14s-18-6-20-14c-2-6 0-12 4-14z" fill="#b39ddb"/>
    ${face(mood, { cy: 34, eyeY: 32, mouthY: 44 })}
    <g fill="none" stroke="#2a2d36" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="54" cy="50" r="7" fill="#fff8e7"/>
      <path d="M59 55l7 7"/>
      <path d="M20 46c-4 2-7 0-9-3"/>
      <path d="M16 48l-3 2"/>
      <path d="M32 58v8l-3 2"/>
      <path d="M48 58v8l3 2"/>
    </g>
    <path d="M18 22l2 3M16 28h3" stroke="#ffd54f" stroke-width="1.5" stroke-linecap="round"/>
  `,
  )
}

/** Frontend — mint cloud + pencil. */
function frontendSvg(mood) {
  return frame(
    '#e8f8f2',
    `
    <path d="M22 36c-4-8 2-16 10-16 2-6 10-8 16-4 6-4 14 0 14 8 6 0 10 6 8 12-2 8-12 14-24 14s-22-6-24-14z" fill="#81c8b0"/>
    ${face(mood, { cy: 36, eyeY: 34, mouthY: 46 })}
    <g stroke="#2a2d36" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M48 28l10-14" fill="none"/>
      <path d="M55 16l5 3-3 5-5-3z" fill="#f6d978"/>
      <path d="M52 22l5 3" fill="none"/>
      <rect x="56.5" y="11" width="5" height="4" rx="1" fill="#f48fb1" stroke="#2a2d36"/>
      <path d="M22 44c-4 1-8-1-10-5" fill="none"/>
      <path d="M12 39c1 2 2 3 3.5 3.5" fill="none"/>
      <path d="M32 58v6l-3 2" fill="none"/>
      <path d="M48 58v6l3 2" fill="none"/>
    </g>
  `,
  )
}

/** Data — soft blue cylinder + mini bars. */
function dataSvg(mood) {
  return frame(
    '#e4f1ff',
    `
    <ellipse cx="40" cy="22" rx="18" ry="7" fill="#7eb6e8"/>
    <path d="M22 22v28c0 4 8 7 18 7s18-3 18-7V22" fill="#90caf9"/>
    <ellipse cx="40" cy="22" rx="18" ry="7" fill="#a8d4f7"/>
    ${face(mood, { cy: 38, eyeY: 36, mouthY: 48 })}
    <g fill="#5b8def">
      <rect x="30" y="52" width="4" height="8" rx="1"/>
      <rect x="38" y="48" width="4" height="12" rx="1"/>
      <rect x="46" y="50" width="4" height="10" rx="1"/>
    </g>
    <g fill="none" stroke="#2a2d36" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 44c-5 1-8-1-10-4"/>
      <path d="M58 44c5 1 8-1 10-4"/>
      <path d="M12 40c1 2 2 3 3.5 3.5"/>
      <path d="M68 40c-1 2-2 3-3.5 3.5"/>
      <path d="M32 62v5l-3 2"/>
      <path d="M48 62v5l3 2"/>
    </g>
  `,
  )
}

/** Ops — teal gear blob + pulse. */
function opsSvg(mood) {
  return frame(
    '#e4f7f4',
    `
    <path d="M40 16l4 5 6-1 2 6 6 3-2 6 4 5-4 5 2 6-6 3-2 6-6-1-4 5-4-5-6 1-2-6-6-3 2-6-4-5 4-5-2-6 6-3 2-6 6 1z" fill="#6fc3b2"/>
    <circle cx="40" cy="40" r="12" fill="#b8ebe1"/>
    ${face(mood, { cy: 40, eyeY: 38, mouthY: 50 })}
    <g fill="none" stroke="#2a2d36" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 48c-3 2-6 1-8-2"/>
      <path d="M62 48c3 2 6 1 8-2"/>
      <path d="M10 46c1 2 2 3 3 3.5"/>
      <path d="M70 46c-1 2-2 3-3 3.5"/>
      <path d="M32 62v5l-3 2"/>
      <path d="M48 62v5l3 2"/>
      <path d="M28 22c2-1 4 0 5 2M52 22c-2-1-4 0-5 2" stroke="#ffd54f"/>
    </g>
  `,
  )
}

/** Kitty — soft peach cat for Gitty / PR helper. */
function kittySvg(mood) {
  return frame(
    '#ffe8d6',
    `
    <ellipse cx="40" cy="44" rx="20" ry="16" fill="#f4b183" stroke="#1f2a37" stroke-width="2.5"/>
    <circle cx="40" cy="32" r="16" fill="#f7c59f" stroke="#1f2a37" stroke-width="2.5"/>
    <path d="M24 26l-2-12 12 8z" fill="#f4b183" stroke="#1f2a37" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M56 26l2-12-12 8z" fill="#f4b183" stroke="#1f2a37" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M26 24l2-8 8 6z" fill="#f9d5b5"/>
    <path d="M54 24l-2-8-8 6z" fill="#f9d5b5"/>
    ${face(mood, { cy: 32, eyeY: 30, mouthY: 42 })}
    <ellipse cx="40" cy="38" rx="2.5" ry="1.6" fill="#f48fb1"/>
    <g fill="none" stroke="#1f2a37" stroke-width="2" stroke-linecap="round">
      <path d="M18 36h8M18 40h7"/>
      <path d="M54 36h8M55 40h7"/>
    </g>
    ${littleFeet()}
  `,
  )
}

/** Uma — designer palette sticker. */
function umaSvg(mood) {
  return frame(
    '#efe4ff',
    `
    <rect x="18" y="16" width="44" height="40" rx="12" fill="#d7b8f3" stroke="#1f2a37" stroke-width="2.5"/>
    <rect x="24" y="22" width="32" height="22" rx="6" fill="#faf6ff" stroke="#1f2a37" stroke-width="2"/>
    <circle cx="30" cy="52" r="5.5" fill="#f48fb1" stroke="#1f2a37" stroke-width="2"/>
    <circle cx="40" cy="52" r="5.5" fill="#ffe082" stroke="#1f2a37" stroke-width="2"/>
    <circle cx="50" cy="52" r="5.5" fill="#81d4fa" stroke="#1f2a37" stroke-width="2"/>
    ${face(mood, { cy: 32, eyeY: 30, mouthY: 40 })}
    ${littleFeet()}
  `,
  )
}

function fallbackSvg(mood) {
  return frame(
    '#eceff4',
    `
    <circle cx="40" cy="36" r="20" fill="#c5cad6" stroke="#1f2a37" stroke-width="2.5"/>
    ${face(mood, { cy: 36, eyeY: 34, mouthY: 46 })}
    ${littleFeet()}
  `,
  )
}
