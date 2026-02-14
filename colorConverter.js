import { clamp, normHueDeg } from "./utils";

// ---------- Constants (D65 illuminant) ----------
const WHITE_D65 = { X: 95.047, Y: 100.0, Z: 108.883 };
const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;

// ---------- CIE Lab <-> XYZ ----------
function labToXyz({ l, a, b }) {
    const fy = (l + 16) / 116;
    const fx = a / 500 + fy;
    const fz = fy - b / 200;

    const finv = (t) => {
        const t3 = t ** 3;
        return t3 > EPSILON ? t3 : (116 * t - 16) / KAPPA;
    };

    const xr = finv(fx);
    const yr = l > (KAPPA * EPSILON) ? (fy ** 3) : (l / KAPPA);
    const zr = finv(fz);

    return {
        X: xr * WHITE_D65.X,
        Y: yr * WHITE_D65.Y,
        Z: zr * WHITE_D65.Z
    };
}

function xyzToLab({ X, Y, Z }) {
    const xr = X / WHITE_D65.X;
    const yr = Y / WHITE_D65.Y;
    const zr = Z / WHITE_D65.Z;

    const f = (t) => {
        return t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116;
    };

    const fx = f(xr);
    const fy = f(yr);
    const fz = f(zr);

    return {
        l: 116 * fy - 16,
        a: 500 * (fx - fy),
        b: 200 * (fy - fz)
    };
}

// ---------- sRGB gamma ----------
function linearToSrgb(u) {
    if (u <= 0.0031308) return 12.92 * u;
    return 1.055 * (u ** (1 / 2.4)) - 0.055;
}

function srgbToLinear(u) {
    if (u <= 0.04045) return u / 12.92;
    return ((u + 0.055) / 1.055) ** 2.4;
}

// ---------- XYZ <-> Linear RGB ----------
function xyzToLinearRgb({ X, Y, Z }) {
    const x = X / 100;
    const y = Y / 100;
    const z = Z / 100;

    return {
        r: 3.2406 * x + (-1.5372) * y + (-0.4986) * z,
        g: (-0.9689) * x + 1.8758 * y + 0.0415 * z,
        b: 0.0557 * x + (-0.2040) * y + 1.0570 * z
    };
}

function linearRgbToXyz({ r, g, b }) {
    const x = 0.4124 * r + 0.3576 * g + 0.1805 * b;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const z = 0.0193 * r + 0.1192 * g + 0.9505 * b;
    return { X: x * 100, Y: y * 100, Z: z * 100 };
}

// ---------- Lab <-> RGB (via XYZ) ----------
function labToRgb({ l, a, b }) {
    const xyz = labToXyz({ l, a, b });
    const lin = xyzToLinearRgb(xyz);

    const sr = linearToSrgb(lin.r);
    const sg = linearToSrgb(lin.g);
    const sb = linearToSrgb(lin.b);

    return {
        r: clamp(sr, 0, 1) * 255,
        g: clamp(sg, 0, 1) * 255,
        b: clamp(sb, 0, 1) * 255
    };
}

function rgbToLab({ r, g, b }) {
    const sr = clamp(r / 255, 0, 1);
    const sg = clamp(g / 255, 0, 1);
    const sb = clamp(b / 255, 0, 1);

    const lin = {
        r: srgbToLinear(sr),
        g: srgbToLinear(sg),
        b: srgbToLinear(sb)
    };

    const xyz = linearRgbToXyz(lin);
    return xyzToLab(xyz);
}

// ---------- Lab <-> LCH ----------
function labToLch({ l, a, b }) {
    const c = Math.sqrt(a * a + b * b);
    const h = normHueDeg(Math.atan2(b, a) * (180 / Math.PI));
    return { l, c, h };
}

function lchToLab({ l, c, h }) {
    const hr = normHueDeg(h) * (Math.PI / 180);
    return {
        l,
        a: c * Math.cos(hr),
        b: c * Math.sin(hr)
    };
}

// ---------- RGB <-> HSV ----------
function rgbToHsv({ r, g, b }) {
    const rr = clamp(r / 255, 0, 1);
    const gg = clamp(g / 255, 0, 1);
    const bb = clamp(b / 255, 0, 1);

    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    const delta = max - min;

    let h = 0;
    if (delta !== 0) {
        if (max === rr) h = 60 * (((gg - bb) / delta) % 6);
        else if (max === gg) h = 60 * (((bb - rr) / delta) + 2);
        else h = 60 * (((rr - gg) / delta) + 4);
    }
    h = normHueDeg(h);

    const s = max === 0 ? 0 : delta / max;
    const v = max;
    return { h, s, v };
}

function hsvToRgb({ h, s, v }) {
    const hh = normHueDeg(h);
    const ss = clamp(s, 0, 1);
    const vv = clamp(v, 0, 1);

    const c = vv * ss;
    const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
    const m = vv - c;

    let rr = 0, gg = 0, bb = 0;
    if (hh < 60) [rr, gg, bb] = [c, x, 0];
    else if (hh < 120) [rr, gg, bb] = [x, c, 0];
    else if (hh < 180) [rr, gg, bb] = [0, c, x];
    else if (hh < 240) [rr, gg, bb] = [0, x, c];
    else if (hh < 300) [rr, gg, bb] = [x, 0, c];
    else [rr, gg, bb] = [c, 0, x];

    return {
        r: (rr + m) * 255,
        g: (gg + m) * 255,
        b: (bb + m) * 255
    };
}

// ---------- Linear RGB <-> OKLab ----------
function linearRgbToOklab({ r, g, b }) {
    const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

    const l_ = Math.cbrt(l);
    const m_ = Math.cbrt(m);
    const s_ = Math.cbrt(s);

    return {
        l: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
        a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
        b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    };
}

function oklabToLinearRgb({ l, a, b }) {
    const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = l - 0.0894841775 * a - 1.2914855480 * b;

    const ll = l_ ** 3;
    const mm = m_ ** 3;
    const ss = s_ ** 3;

    return {
        r: 4.0767416621 * ll - 3.3077115913 * mm + 0.2309699292 * ss,
        g: -1.2684380046 * ll + 2.6097574011 * mm - 0.3413193965 * ss,
        b: -0.0041960863 * ll - 0.7034186147 * mm + 1.7076147010 * ss
    };
}

// ---------- Lab <-> OKLab (via XYZ + Linear RGB) ----------
function labToOklab({ l, a, b }) {
    const xyz = labToXyz({ l, a, b });
    const lin = xyzToLinearRgb(xyz);
    return linearRgbToOklab(lin);
}

function oklabToLab({ l, a, b }) {
    const lin = oklabToLinearRgb({ l, a, b });
    const xyz = linearRgbToXyz(lin);
    return xyzToLab(xyz);
}

// ---------- OKLab <-> OKLCH ----------
function oklabToOklch({ l, a, b }) {
    const c = Math.sqrt(a * a + b * b);
    const h = normHueDeg(Math.atan2(b, a) * (180 / Math.PI));
    return { l, c, h };
}

function oklchToOklab({ l, c, h }) {
    const hr = normHueDeg(h) * (Math.PI / 180);
    return {
        l,
        a: c * Math.cos(hr),
        b: c * Math.sin(hr)
    };
}

export {
    labToXyz,
    xyzToLab,
    linearToSrgb,
    srgbToLinear,
    xyzToLinearRgb,
    linearRgbToXyz,
    labToRgb,
    rgbToLab,
    labToLch,
    lchToLab,
    rgbToHsv,
    hsvToRgb,
    linearRgbToOklab,
    oklabToLinearRgb,
    labToOklab,
    oklabToLab,
    oklabToOklch,
    oklchToOklab
};
