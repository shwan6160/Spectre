function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function isFiniteNumber(value) {
    if (typeof value === 'function') {
        return Number.isFinite(Number(value));
    }
    return typeof value === 'number' && Number.isFinite(value);
}

function normHueDeg(deg) {
    if (!isFiniteNumber(deg)) return 0;
    const x = deg % 360;
    return x < 0 ? x + 360 : x;
}

function formatNumber(value, decimals = 4) {
    if (!isFiniteNumber(value)) return '0';
    const pow = 10 ** decimals;
    const rounded = Math.round(value * pow) / pow;
    return String(rounded);
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function lerpAngleDeg(a, b, t) {
    const a0 = normHueDeg(a);
    const b0 = normHueDeg(b);
    const delta = ((((b0 - a0) % 360) + 540) % 360) - 180;
    return normHueDeg(a0 + delta * t);
}

export {
    clamp,
    isFiniteNumber,
    normHueDeg,
    formatNumber,
    lerp,
    lerpAngleDeg
}
