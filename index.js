import chroma from "https://cdn.jsdelivr.net/npm/chroma-js@3.2.0/index.js/+esm";

// chroma.js scale
function colorEaseOut(color1, color2, easedT, mode = "rgb", doChromaCorrection = false) {
    const colorScale = chroma.scale([color1, color2]).mode(mode);
    const newColor = colorScale(easedT);
    const chromaMultiplier = 1 + easedT;

    // Chroma correction on alpha altering
    if (newColor.alpha() < color1.alpha()) {
        return newColor.set('oklch.c', Math.min(newColor.get('oklch.c') * chromaMultiplier, 0.55)).css(mode);
    } else {
        return newColor.css(mode);
    } 
}

class Percent {
    #value;

    constructor(value) {
        this.value = value;
    }
    
    get value() { return this.#value}
    set value(value) {
        if (typeof value === 'number') {
            if (value >= 0 && value <= 100) {
                this.#value = value;
            } else {
                throw new Error("ValueError: Value of Percent() must be at least 0, up to 100.");
            }
        } else {
            throw new TypeError("Value of Percent() must be Number");
        }
    }
    toString() {
        return `${this.value}%`;
    }
    toNumber() {
        return this.value / 100;
    }
}
function pct(value){ return new Percent(value) };

class Color {
    #lab = {l: 0, a: 0, b: 0};
    #alpha = 1;

    constructor() {
    }

    // ---------- Internal helpers (SSOT: #lab + #alpha) ----------
    static #clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    static #isFiniteNumber(value) {
        return typeof value === 'number' && Number.isFinite(value);
    }

    static #normHueDeg(deg) {
        if (!Color.#isFiniteNumber(deg)) return 0;
        const x = deg % 360;
        return x < 0 ? x + 360 : x;
    }

    static #formatNumber(value, decimals = 4) {
        if (!Color.#isFiniteNumber(value)) return '0';
        const pow = 10 ** decimals;
        const rounded = Math.round(value * pow) / pow;
        return String(rounded);
    }

    static #parseAlpha(value) {
        if (value instanceof Percent) {
            return Color.#clamp(value.toNumber(), 0, 1);
        }
        if (Color.#isFiniteNumber(value)) {
            if (value >= 0 && value <= 1) return value;
            throw new Error("ValueError: Alpha number must be in [0,1]. Use Percent for percentages.");
        }
        throw new TypeError("Value of Color.alpha must be Percent or Number");
    }

    static #parseUnit01(value) {
        // Used for s/v (HSV) and OKLab lightness where numbers are commonly 0..1; accept Percent.
        if (value instanceof Percent) return Color.#clamp(value.toNumber(), 0, 1);
        if (Color.#isFiniteNumber(value)) {
            if (value >= 0 && value <= 1) return value;
            throw new Error("ValueError: Expected number in [0,1]. Use Percent for percentages.");
        }
        throw new TypeError("Value must be Percent or Number");
    }

    static #parseLightness100(value) {
        // Input parser for CIE Lab/LCH lightness (SSOT is 0..100).
        // Rule: if Number, must be 0..1 (fraction). If Percent, uses 0..100.
        if (value instanceof Percent) return Color.#clamp(value.value, 0, 100);
        if (Color.#isFiniteNumber(value)) {
            if (value >= 0 && value <= 1) return value * 100;
            throw new Error("ValueError: Lightness number must be in [0,1]. Use Percent for percentages.");
        }
        throw new TypeError("Value must be Percent or Number");
    }

    // ---------- Color conversion math (D65) ----------
    static #WHITE_D65 = { X: 95.047, Y: 100.0, Z: 108.883 };
    static #EPSILON = 216 / 24389;
    static #KAPPA = 24389 / 27;

    static #labToXyz({ l, a, b }) {
        const fy = (l + 16) / 116;
        const fx = a / 500 + fy;
        const fz = fy - b / 200;

        const finv = (t) => {
            const t3 = t ** 3;
            return t3 > Color.#EPSILON ? t3 : (116 * t - 16) / Color.#KAPPA;
        };

        const xr = finv(fx);
        // Standard inverse for Y uses L directly below the linear threshold.
        const yr = l > (Color.#KAPPA * Color.#EPSILON) ? (fy ** 3) : (l / Color.#KAPPA);
        const zr = finv(fz);

        return {
            X: xr * Color.#WHITE_D65.X,
            Y: yr * Color.#WHITE_D65.Y,
            Z: zr * Color.#WHITE_D65.Z
        };
    }

    static #xyzToLab({ X, Y, Z }) {
        const xr = X / Color.#WHITE_D65.X;
        const yr = Y / Color.#WHITE_D65.Y;
        const zr = Z / Color.#WHITE_D65.Z;

        const f = (t) => {
            return t > Color.#EPSILON ? Math.cbrt(t) : (Color.#KAPPA * t + 16) / 116;
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

    static #linearToSrgb(u) {
        if (u <= 0.0031308) return 12.92 * u;
        return 1.055 * (u ** (1 / 2.4)) - 0.055;
    }

    static #srgbToLinear(u) {
        if (u <= 0.04045) return u / 12.92;
        return ((u + 0.055) / 1.055) ** 2.4;
    }

    static #xyzToLinearRgb({ X, Y, Z }) {
        // XYZ expected in 0..100
        const x = X / 100;
        const y = Y / 100;
        const z = Z / 100;

        return {
            r: 3.2406 * x + (-1.5372) * y + (-0.4986) * z,
            g: (-0.9689) * x + 1.8758 * y + 0.0415 * z,
            b: 0.0557 * x + (-0.2040) * y + 1.0570 * z
        };
    }

    static #linearRgbToXyz({ r, g, b }) {
        // Returns XYZ in 0..100 (D65)
        const x = 0.4124 * r + 0.3576 * g + 0.1805 * b;
        const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const z = 0.0193 * r + 0.1192 * g + 0.9505 * b;
        return { X: x * 100, Y: y * 100, Z: z * 100 };
    }

    static #labToRgb({ l, a, b }) {
        const xyz = Color.#labToXyz({ l, a, b });
        const lin = Color.#xyzToLinearRgb(xyz);

        const sr = Color.#linearToSrgb(lin.r);
        const sg = Color.#linearToSrgb(lin.g);
        const sb = Color.#linearToSrgb(lin.b);

        return {
            r: Color.#clamp(sr, 0, 1) * 255,
            g: Color.#clamp(sg, 0, 1) * 255,
            b: Color.#clamp(sb, 0, 1) * 255
        };
    }

    static #rgbToLab({ r, g, b }) {
        const sr = Color.#clamp(r / 255, 0, 1);
        const sg = Color.#clamp(g / 255, 0, 1);
        const sb = Color.#clamp(b / 255, 0, 1);

        const lin = {
            r: Color.#srgbToLinear(sr),
            g: Color.#srgbToLinear(sg),
            b: Color.#srgbToLinear(sb)
        };

        const xyz = Color.#linearRgbToXyz(lin);
        return Color.#xyzToLab(xyz);
    }

    static #labToLch({ l, a, b }) {
        const c = Math.sqrt(a * a + b * b);
        const h = Color.#normHueDeg(Math.atan2(b, a) * (180 / Math.PI));
        return { l, c, h };
    }

    static #lchToLab({ l, c, h }) {
        const hr = Color.#normHueDeg(h) * (Math.PI / 180);
        return {
            l,
            a: c * Math.cos(hr),
            b: c * Math.sin(hr)
        };
    }

    static #rgbToHsv({ r, g, b }) {
        const rr = Color.#clamp(r / 255, 0, 1);
        const gg = Color.#clamp(g / 255, 0, 1);
        const bb = Color.#clamp(b / 255, 0, 1);

        const max = Math.max(rr, gg, bb);
        const min = Math.min(rr, gg, bb);
        const delta = max - min;

        let h = 0;
        if (delta !== 0) {
            if (max === rr) h = 60 * (((gg - bb) / delta) % 6);
            else if (max === gg) h = 60 * (((bb - rr) / delta) + 2);
            else h = 60 * (((rr - gg) / delta) + 4);
        }
        h = Color.#normHueDeg(h);

        const s = max === 0 ? 0 : delta / max;
        const v = max;
        return { h, s, v };
    }

    static #hsvToRgb({ h, s, v }) {
        const hh = Color.#normHueDeg(h);
        const ss = Color.#clamp(s, 0, 1);
        const vv = Color.#clamp(v, 0, 1);

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

    static #linearRgbToOklab({ r, g, b }) {
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

    static #oklabToLinearRgb({ l, a, b }) {
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

    static #labToOklab({ l, a, b }) {
        const xyz = Color.#labToXyz({ l, a, b });
        const lin = Color.#xyzToLinearRgb(xyz);
        return Color.#linearRgbToOklab(lin);
    }

    static #oklabToLab({ l, a, b }) {
        const lin = Color.#oklabToLinearRgb({ l, a, b });
        const xyz = Color.#linearRgbToXyz(lin);
        return Color.#xyzToLab(xyz);
    }

    static #oklabToOklch({ l, a, b }) {
        const c = Math.sqrt(a * a + b * b);
        const h = Color.#normHueDeg(Math.atan2(b, a) * (180 / Math.PI));
        return { l, c, h };
    }

    static #oklchToOklab({ l, c, h }) {
        const hr = Color.#normHueDeg(h) * (Math.PI / 180);
        return {
            l,
            a: c * Math.cos(hr),
            b: c * Math.sin(hr)
        };
    }

    #setLab(nextLab) {
        this.#lab = {
            l: nextLab.l,
            a: nextLab.a,
            b: nextLab.b
        };
    }

    get alpha() {
        return this.#alpha;
    }

    set alpha(value) {
        this.#alpha = Color.#parseAlpha(value);
        return true;
    }

    get lab() {
        const parent = this;

        // lab() itself is kind of constructor style function.
        const target = (l, a, b, alpha = 1) => {
            proxy.l = l;
            proxy.a = a;
            proxy.b = b;
            parent.alpha = alpha;
        }

        const css = () => {
            const lPct = `${Color.#formatNumber(Color.#clamp(parent.#lab.l, 0, 100), 4)}%`;
            const aVal = Color.#formatNumber(proxy.a, 4);
            const bVal = Color.#formatNumber(proxy.b, 4);
            const alphaVal = Color.#formatNumber(parent.alpha, 4);
            return `lab(${lPct} ${aVal} ${bVal} / ${alphaVal})`;
        }

        const proxy = new Proxy(target, {
            get(target, prop) {
                if (prop === "toString") return css;
                if (prop === Symbol.toPrimitive) return () => css();
                if (prop === 'alpha') return parent.alpha;
                if (prop === 'l') return parent.#lab.l / 100;
                return parent.#lab[prop];
            },
            set(target, prop, value) {
                try {
                    if (prop === 'alpha') {
                        parent.alpha = value;
                        return true;
                    }
                    if (prop === 'l') parent.#lab.l = Color.#parseLightness100(value);
                    else parent.#lab[prop] = value;
                    return true;
                } catch(e) {
                    console.warn("Color Update Falied.");
                    throw e;
                }
            }
        });

        return proxy;
    }

    // ---------- Model Proxies ----------
    #createModelProxy(model) {
        const parent = this;

        const proxyTarget = (...args) => {
            model.call(args);
        };

        const proxy = new Proxy(proxyTarget, {
            get(target, prop) {
                if (prop === 'toString') return model.toString.bind(model);
                if (prop === Symbol.toPrimitive) return () => model.toString.call(model);
                return model.get(prop);
            },
            set(target, prop, value) {
                model.set(prop, value);
                return true;
            }
        });

        // Bind model closures to parent + proxy (bulk update helper)
        model.bind(parent, proxy);
        return proxy;
    }

    get rgb() {
        const model = {
            bind(parent) {
                this.parent = parent;
            },
            get(prop) {
                const { r, g, b } = Color.#labToRgb(this.parent.#lab);
                if (prop === 'r') return r;
                if (prop === 'g') return g;
                if (prop === 'b') return b;
                if (prop === 'alpha') return this.parent.alpha;
                return undefined;
            },
            set(prop, value) {
                const current = { ...Color.#labToRgb(this.parent.#lab) };

                if (prop === 'alpha') {
                    this.parent.alpha = value;
                    return;
                }

                if (!['r', 'g', 'b'].includes(prop)) return;
                if (!Color.#isFiniteNumber(value)) throw new TypeError('RGB channels must be Number');
                current[prop] = value;
                const nextLab = Color.#rgbToLab(current);
                this.parent.#setLab(nextLab);
            },
            call(args) {
                const [r, g, b, alpha = this.parent.alpha] = args;
                const nextLab = Color.#rgbToLab({ r, g, b });
                this.parent.#setLab(nextLab);
                this.parent.alpha = alpha;
            },
            toString() {
                const { r, g, b } = Color.#labToRgb(this.parent.#lab);
                const rr = Math.round(Color.#clamp(r, 0, 255));
                const gg = Math.round(Color.#clamp(g, 0, 255));
                const bb = Math.round(Color.#clamp(b, 0, 255));
                const a = Color.#formatNumber(this.parent.alpha, 4);
                return `rgb(${rr} ${gg} ${bb} / ${a})`;
            }
        };

        return this.#createModelProxy(model);
    }

    get hsv() {
        const model = {
            bind(parent) {
                this.parent = parent;
            },
            get(prop) {
                const rgb = Color.#labToRgb(this.parent.#lab);
                const hsv = Color.#rgbToHsv(rgb);
                if (prop === 'h') return hsv.h;
                if (prop === 's') return hsv.s;
                if (prop === 'v') return hsv.v;
                if (prop === 'alpha') return this.parent.alpha;
                return undefined;
            },
            set(prop, value) {
                if (prop === 'alpha') {
                    this.parent.alpha = value;
                    return;
                }

                const rgb = Color.#labToRgb(this.parent.#lab);
                const current = Color.#rgbToHsv(rgb);

                if (prop === 'h') {
                    if (!Color.#isFiniteNumber(value)) throw new TypeError('HSV.h must be Number');
                    current.h = value;
                } else if (prop === 's') {
                    current.s = Color.#parseUnit01(value);
                } else if (prop === 'v') {
                    current.v = Color.#parseUnit01(value);
                } else {
                    return;
                }

                const nextRgb = Color.#hsvToRgb(current);
                const nextLab = Color.#rgbToLab(nextRgb);
                this.parent.#setLab(nextLab);
            },
            call(args) {
                const [h, s, v, alpha = this.parent.alpha] = args;
                const hsv = {
                    h,
                    s: Color.#parseUnit01(s),
                    v: Color.#parseUnit01(v)
                };
                const nextRgb = Color.#hsvToRgb(hsv);
                const nextLab = Color.#rgbToLab(nextRgb);
                this.parent.#setLab(nextLab);
                this.parent.alpha = alpha;
            },
            toString() {
                const rgb = Color.#labToRgb(this.parent.#lab);
                const { h, s, v } = Color.#rgbToHsv(rgb);
                const hStr = Color.#formatNumber(h, 2);
                const sPct = `${Color.#formatNumber(s * 100, 2)}%`;
                const vPct = `${Color.#formatNumber(v * 100, 2)}%`;
                const a = Color.#formatNumber(this.parent.alpha, 4);
                // Note: `hsv()` is not a standard CSS function (placeholder string).
                return `hsv(${hStr} ${sPct} ${vPct} / ${a})`;
            }
        };

        return this.#createModelProxy(model);
    }

    get lch() {
        const model = {
            bind(parent) {
                this.parent = parent;
            },
            get(prop) {
                const lch = Color.#labToLch(this.parent.#lab);
                if (prop === 'l') return lch.l / 100;
                if (prop === 'c') return lch.c;
                if (prop === 'h') return lch.h;
                if (prop === 'alpha') return this.parent.alpha;
                return undefined;
            },
            set(prop, value) {
                if (prop === 'alpha') {
                    this.parent.alpha = value;
                    return;
                }

                const current = Color.#labToLch(this.parent.#lab);
                if (prop === 'l') current.l = Color.#parseLightness100(value);
                else if (prop === 'c') {
                    if (!Color.#isFiniteNumber(value)) throw new TypeError('LCH.c must be Number');
                    current.c = Math.max(0, value);
                }
                else if (prop === 'h') {
                    if (!Color.#isFiniteNumber(value)) throw new TypeError('LCH.h must be Number');
                    current.h = value;
                }
                else return;

                const nextLab = Color.#lchToLab(current);
                this.parent.#setLab(nextLab);
            },
            call(args) {
                const [l, c, h, alpha = this.parent.alpha] = args;
                const lch = {
                    l: Color.#parseLightness100(l),
                    c: Math.max(0, c),
                    h
                };
                const nextLab = Color.#lchToLab(lch);
                this.parent.#setLab(nextLab);
                this.parent.alpha = alpha;
            },
            toString() {
                const { l, c, h } = Color.#labToLch(this.parent.#lab);
                const lPct = `${Color.#formatNumber(Color.#clamp(l, 0, 100), 4)}%`;
                const cStr = Color.#formatNumber(c, 4);
                const hStr = Color.#formatNumber(h, 2);
                const a = Color.#formatNumber(this.parent.alpha, 4);
                return `lch(${lPct} ${cStr} ${hStr} / ${a})`;
            }
        };

        return this.#createModelProxy(model);
    }

    get oklab() {
        const model = {
            bind(parent) {
                this.parent = parent;
            },
            get(prop) {
                const oklab = Color.#labToOklab(this.parent.#lab);
                if (prop === 'l') return oklab.l;
                if (prop === 'a') return oklab.a;
                if (prop === 'b') return oklab.b;
                if (prop === 'alpha') return this.parent.alpha;
                return undefined;
            },
            set(prop, value) {
                if (prop === 'alpha') {
                    this.parent.alpha = value;
                    return;
                }

                const current = Color.#labToOklab(this.parent.#lab);
                if (prop === 'l') current.l = Color.#parseUnit01(value);
                else if (prop === 'a') {
                    if (!Color.#isFiniteNumber(value)) throw new TypeError('OKLab.a must be Number');
                    current.a = value;
                }
                else if (prop === 'b') {
                    if (!Color.#isFiniteNumber(value)) throw new TypeError('OKLab.b must be Number');
                    current.b = value;
                }
                else return;

                const nextLab = Color.#oklabToLab(current);
                this.parent.#setLab(nextLab);
            },
            call(args) {
                const [l, a, b, alpha = this.parent.alpha] = args;
                const oklab = {
                    l: Color.#parseUnit01(l),
                    a,
                    b
                };
                const nextLab = Color.#oklabToLab(oklab);
                this.parent.#setLab(nextLab);
                this.parent.alpha = alpha;
            },
            toString() {
                const { l, a, b } = Color.#labToOklab(this.parent.#lab);
                const lPct = `${Color.#formatNumber(l * 100, 4)}%`;
                const aStr = Color.#formatNumber(a, 5);
                const bStr = Color.#formatNumber(b, 5);
                const alpha = Color.#formatNumber(this.parent.alpha, 4);
                return `oklab(${lPct} ${aStr} ${bStr} / ${alpha})`;
            }
        };

        return this.#createModelProxy(model);
    }

    get oklch() {
        const model = {
            bind(parent) {
                this.parent = parent;
            },
            get(prop) {
                const oklab = Color.#labToOklab(this.parent.#lab);
                const oklch = Color.#oklabToOklch(oklab);
                if (prop === 'l') return oklch.l;
                if (prop === 'c') return oklch.c;
                if (prop === 'h') return oklch.h;
                if (prop === 'alpha') return this.parent.alpha;
                return undefined;
            },
            set(prop, value) {
                if (prop === 'alpha') {
                    this.parent.alpha = value;
                    return;
                }

                const oklab = Color.#labToOklab(this.parent.#lab);
                const current = Color.#oklabToOklch(oklab);

                if (prop === 'l') current.l = Color.#parseUnit01(value);
                else if (prop === 'c') {
                    if (!Color.#isFiniteNumber(value)) throw new TypeError('OKLCH.c must be Number');
                    current.c = Math.max(0, value);
                }
                else if (prop === 'h') {
                    if (!Color.#isFiniteNumber(value)) throw new TypeError('OKLCH.h must be Number');
                    current.h = value;
                }
                else return;

                const nextOkLab = Color.#oklchToOklab(current);
                const nextLab = Color.#oklabToLab(nextOkLab);
                this.parent.#setLab(nextLab);
            },
            call(args) {
                const [l, c, h, alpha = this.parent.alpha] = args;
                const oklch = {
                    l: Color.#parseUnit01(l),
                    c: Math.max(0, c),
                    h
                };
                const nextOkLab = Color.#oklchToOklab(oklch);
                const nextLab = Color.#oklabToLab(nextOkLab);
                this.parent.#setLab(nextLab);
                this.parent.alpha = alpha;
            },
            toString() {
                const oklab = Color.#labToOklab(this.parent.#lab);
                const { l, c, h } = Color.#oklabToOklch(oklab);
                const lPct = `${Color.#formatNumber(l * 100, 4)}%`;
                const cStr = Color.#formatNumber(c, 5);
                const hStr = Color.#formatNumber(h, 2);
                const alpha = Color.#formatNumber(this.parent.alpha, 4);
                return `oklch(${lPct} ${cStr} ${hStr} / ${alpha})`;
            }
        };

        return this.#createModelProxy(model);
    }
}

// LinearGradient class
class LinearGradient {
    constructor(stops = [], angle = 180, mode = "rgb") {
        this.stops = stops;
        this.angle = angle;

        this.mode = mode;

        this.stops.sort((a, b) => a.pos - b.pos);
    }

    addStop(color, pos) {
        this.stops.push({ color, pos });
        this.stops.sort((a, b) => a.pos - b.pos);
        return this;
    }

    getColorAt(pos) {
        const colors = this.stops.map(s => {
            if (s.color && typeof s.color.css === 'function') {
                return s.color.css(); 
            }
            return s.color;
        });
        const positions = this.stops.map(s => s.pos);

        const scale = chroma.scale(colors).domain(positions).mode('lch');
        
        return scale(pos);
    }

    scale(grad) {
        return (t) => {
            const newDeg = this.angle + (grad.angle - this.angle) * t;

            const allPositions = new Set([
                ...this.stops.map(s => s.pos),
                ...grad.stops.map(s => s.pos)
            ]);

            const sortedPositions = Array.from(allPositions).sort((a, b) => a - b);

            const newStops = sortedPositions.map(pos => {
                const colorA = this.getColorAt(pos);
                const colorB = grad.getColorAt(pos);

                const mixedColor = colorEaseOut(colorA, colorB, t);

                return { color: mixedColor, pos: pos };
            });

            return new LinearGradient(newStops, newDeg, grad.mode);
        }
    }

    css(mode = '') {
        const colorMode = (mode == '') ? this.mode : mode;
        if (this.stops.length === 0) return 'none';
        const stopStr = this.stops.map(stop => {
            const c = (stop.color && typeof stop.color.css === 'function')
                ? stop.color.css(colorMode)
                : stop.color;

            let positions = '';
            
            // auto percentage convert
            const formatPos = (val) => (val <= 1 ? val * 100 : val) + '%';

            if (Array.isArray(stop.pos)) {
                if (length(stop.pos) > 2) {
                    console.error('Gradient stop\'s positions must be less then two');
                }
                positions = stop.pos.map(formatPos).join(' ');
            } else {
                positions = formatPos(stop.pos);
            }

            return `${c} ${positions}`;
        }).join(', ');

        return `linear-gradient(${this.angle}deg in ${colorMode}, ${stopStr})`;
    }
}

export {
    colorEaseOut,
    Color,
    LinearGradient
};
