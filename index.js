import { clamp, isFiniteNumber, normHueDeg, formatNumber, lerp, lerpAngleDeg } from "./utils.js";
import {
    labToRgb, rgbToLab,
    labToLch, lchToLab,
    rgbToHsv, hsvToRgb,
    labToOklab, oklabToLab,
    oklabToOklch, oklchToOklab
} from "./colorConverter.js";

// Spectre core (no external color library dependency)
function colorEaseOut(color1, color2, easedT, mode = "rgb", doChromaCorrection = false) {
    const mixed = Color.interpolate(color1, color2, easedT, mode);

    if (doChromaCorrection && mixed.alpha < color1.alpha) {
        const chromaMultiplier = 1 + easedT;
        mixed.oklch.c = Math.min(mixed.oklch.c * chromaMultiplier, 0.55);
    }

    return mixed[mode].css();
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
    
    valueOf() {
        return this.value;
    }
    
    [Symbol.toPrimitive](hint) {
        if (hint === 'string') {
            return `${this.value}%`;
        }
        return this.value / 100; // number or default
    }
}
function pct(value){ return new Percent(value) };

class Color {
    #lab = {l: 0, a: 0, b: 0};
    #alpha = 1;

    constructor() {
    }

    clone() {
        const next = new Color();
        next.#lab = { ...this.#lab };
        next.#alpha = this.#alpha;
        return next;
    }

    // ---------- Internal helpers (SSOT: #lab + #alpha) ----------

    static interpolate(colorA, colorB, t, mode = 'rgb') {
        const tt = clamp(t, 0, 1);
        const m = String(mode || 'rgb').toLowerCase();

        const out = new Color();
        const outAlpha = lerp(colorA.alpha, colorB.alpha, tt);

        if (m === 'lab') {
            out.#setLab({
                l: lerp(colorA.#lab.l, colorB.#lab.l, tt),
                a: lerp(colorA.#lab.a, colorB.#lab.a, tt),
                b: lerp(colorA.#lab.b, colorB.#lab.b, tt)
            });
            out.alpha = outAlpha;
            return out;
        }

        if (m === 'lch') {
            const la = labToLch(colorA.#lab);
            const lb = labToLch(colorB.#lab);
            out.lch(
                lerp(la.l, lb.l, tt) / 100,
                lerp(la.c, lb.c, tt),
                lerpAngleDeg(la.h, lb.h, tt),
                outAlpha
            );
            return out;
        }

        if (m === 'oklab') {
            const oa = labToOklab(colorA.#lab);
            const ob = labToOklab(colorB.#lab);
            out.oklab(
                lerp(oa.l, ob.l, tt),
                lerp(oa.a, ob.a, tt),
                lerp(oa.b, ob.b, tt),
                outAlpha
            );
            return out;
        }

        if (m === 'oklch') {
            const oa = oklabToOklch(labToOklab(colorA.#lab));
            const ob = oklabToOklch(labToOklab(colorB.#lab));
            out.oklch(
                lerp(oa.l, ob.l, tt),
                lerp(oa.c, ob.c, tt),
                lerpAngleDeg(oa.h, ob.h, tt),
                outAlpha
            );
            return out;
        }

        if (m === 'hsv') {
            const ha = rgbToHsv(labToRgb(colorA.#lab));
            const hb = rgbToHsv(labToRgb(colorB.#lab));
            out.hsv(
                lerpAngleDeg(ha.h, hb.h, tt),
                lerp(ha.s, hb.s, tt),
                lerp(ha.v, hb.v, tt),
                outAlpha
            );
            return out;
        }

        // rgb (default)
        const ra = labToRgb(colorA.#lab);
        const rb = labToRgb(colorB.#lab);
        out.rgb(
            lerp(ra.r, rb.r, tt),
            lerp(ra.g, rb.g, tt),
            lerp(ra.b, rb.b, tt),
            outAlpha
        );
        return out;
    }

    static scale(colors = []) {
        const state = {
            colors: colors,
            mode: 'rgb'
        };

        const fn = (value) => {
            if (state.colors.length === 0) throw new Error('ValueError: scale() requires at least one color.');
            if (state.colors.length === 1) return state.colors[0].clone();

            const t = Color.#parseValue01(value);

            const n = state.colors.length;
            const scaled = t * (n - 1);
            const i = Math.min(Math.floor(scaled), n - 2);
            const u = scaled - i;

            return Color.interpolate(state.colors[i], state.colors[i + 1], u, state.mode);
        };

        fn.mode = (mode) => {
            state.mode = String(mode || 'rgb').toLowerCase();
            return fn;
        };

        return fn;
    }

    static #parseAlpha(value) {
        if (value instanceof Percent) {
            return clamp(value.toNumber(), 0, 1);
        }
        if (isFiniteNumber(value)) {
            if (value >= 0 && value <= 1) return value;
            throw new Error("ValueError: Alpha number must be in [0,1]. Use Percent for percentages.");
        }
        throw new TypeError("Value of Color.alpha must be Percent or Number");
    }

    static #parseValue01(value) {
        // Used for s/v (HSV) and OKLab lightness where numbers are commonly 0..1; accept Percent.
        if (value instanceof Percent) return clamp(value.toNumber(), 0, 1);
        if (isFiniteNumber(value)) {
            if (value >= 0 && value <= 1) return value;
            throw new Error("ValueError: Expected number in [0,1]. Use Percent for percentages.");
        }
        throw new TypeError("Value must be Percent or Number");
    }

    static #parseLightness100(value) {
        // Input parser for CIE Lab/LCH lightness (SSOT is 0..100).
        // Rule: if Number, must be 0..1 (fraction). If Percent, uses 0..100.
        if (value instanceof Percent) return clamp(value.value, 0, 100);
        if (isFiniteNumber(value)) {
            if (value >= 0 && value <= 1) return value * 100;
            throw new Error("ValueError: Lightness number must be in [0,1]. Use Percent for percentages.");
        }
        throw new TypeError("Value must be Percent or Number");
    }

    #setLab(nextLab) {
        this.#lab = {
            l: nextLab.l,
            a: nextLab.a,
            b: nextLab.b
        };
    }

    get alpha() {
        const parent = this;
        const fn = function(value) {
            const next = parent.clone();
            next.alpha = value;
            return next;
        };
        fn.valueOf = () => parent.#alpha;
        fn.toString = () => String(parent.#alpha);
        fn[Symbol.toPrimitive] = () => parent.#alpha;
        return fn;
    }

    set alpha(value) {
        const v = (typeof value === 'function') ? Number(value) : value;
        this.#alpha = Color.#parseAlpha(v);
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
            const lPct = `${formatNumber(clamp(parent.#lab.l, 0, 100), 4)}%`;
            const aVal = formatNumber(proxy.a, 4);
            const bVal = formatNumber(proxy.b, 4);
            const alphaVal = formatNumber(parent.alpha, 4);
            return `lab(${lPct} ${aVal} ${bVal} / ${alphaVal})`;
        }

        const proxy = new Proxy(target, {
            get(_, prop) {
                if (prop === "toString" || prop === "css") return css;
                if (prop === Symbol.toPrimitive) return () => css();
                if (prop === 'alpha') return parent.alpha;
                if (prop === 'l') return parent.#lab.l / 100;
                return parent.#lab[prop];
            },
            set(_, prop, value) {
                try {
                    if (prop === 'alpha') {
                        parent.alpha = value;
                        return true;
                    }
                    if (prop === 'l') parent.#lab.l = Color.#parseLightness100(value);
                    else parent.#lab[prop] = value;
                    return true;
                } catch(e) {
                    console.warn("Color Update Failed.");
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
                if (prop === 'toString' || prop === 'css') return model.toString.bind(model);
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
                const { r, g, b } = labToRgb(this.parent.#lab);
                if (prop === 'r') return r;
                if (prop === 'g') return g;
                if (prop === 'b') return b;
                if (prop === 'alpha') return this.parent.alpha;
                return undefined;
            },
            set(prop, value) {
                const current = { ...labToRgb(this.parent.#lab) };

                if (prop === 'alpha') {
                    this.parent.alpha = value;
                    return;
                }

                if (!['r', 'g', 'b'].includes(prop)) return;
                if (!isFiniteNumber(value)) throw new TypeError('RGB channels must be Number');
                current[prop] = value;
                const nextLab = rgbToLab(current);
                this.parent.#setLab(nextLab);
            },
            call(args) {
                const [r, g, b, alpha = this.parent.alpha] = args;
                const nextLab = rgbToLab({ r, g, b });
                this.parent.#setLab(nextLab);
                this.parent.alpha = alpha;
            },
            toString() {
                const { r, g, b } = labToRgb(this.parent.#lab);
                const rr = Math.round(clamp(r, 0, 255));
                const gg = Math.round(clamp(g, 0, 255));
                const bb = Math.round(clamp(b, 0, 255));
                const a = formatNumber(this.parent.alpha, 4);
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
                const rgb = labToRgb(this.parent.#lab);
                const hsv = rgbToHsv(rgb);
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

                const rgb = labToRgb(this.parent.#lab);
                const current = rgbToHsv(rgb);

                if (prop === 'h') {
                    if (!isFiniteNumber(value)) throw new TypeError('HSV.h must be Number');
                    current.h = value;
                } else if (prop === 's') {
                    current.s = Color.#parseValue01(value);
                } else if (prop === 'v') {
                    current.v = Color.#parseValue01(value);
                } else {
                    return;
                }

                const nextRgb = hsvToRgb(current);
                const nextLab = rgbToLab(nextRgb);
                this.parent.#setLab(nextLab);
            },
            call(args) {
                const [h, s, v, alpha = this.parent.alpha] = args;
                const hsv = {
                    h,
                    s: Color.#parseValue01(s),
                    v: Color.#parseValue01(v)
                };
                const nextRgb = hsvToRgb(hsv);
                const nextLab = rgbToLab(nextRgb);
                this.parent.#setLab(nextLab);
                this.parent.alpha = alpha;
            },
            toString() {
                const rgb = labToRgb(this.parent.#lab);
                const { h, s, v } = rgbToHsv(rgb);
                const hStr = formatNumber(h, 2);
                const sPct = `${formatNumber(s * 100, 2)}%`;
                const vPct = `${formatNumber(v * 100, 2)}%`;
                const a = formatNumber(this.parent.alpha, 4);
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
                const lch = labToLch(this.parent.#lab);
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

                const current = labToLch(this.parent.#lab);
                if (prop === 'l') current.l = Color.#parseLightness100(value);
                else if (prop === 'c') {
                    if (!isFiniteNumber(value)) throw new TypeError('LCH.c must be Number');
                    current.c = Math.max(0, value);
                }
                else if (prop === 'h') {
                    if (!isFiniteNumber(value)) throw new TypeError('LCH.h must be Number');
                    current.h = value;
                }
                else return;

                const nextLab = lchToLab(current);
                this.parent.#setLab(nextLab);
            },
            call(args) {
                const [l, c, h, alpha = this.parent.alpha] = args;
                const lch = {
                    l: Color.#parseLightness100(l),
                    c: Math.max(0, c),
                    h
                };
                const nextLab = lchToLab(lch);
                this.parent.#setLab(nextLab);
                this.parent.alpha = alpha;
            },
            toString() {
                const { l, c, h } = labToLch(this.parent.#lab);
                const lPct = `${formatNumber(clamp(l, 0, 100), 4)}%`;
                const cStr = formatNumber(c, 4);
                const hStr = formatNumber(h, 2);
                const a = formatNumber(this.parent.alpha, 4);
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
                const ok = labToOklab(this.parent.#lab);
                if (prop === 'l') return ok.l;
                if (prop === 'a') return ok.a;
                if (prop === 'b') return ok.b;
                if (prop === 'alpha') return this.parent.alpha;
                return undefined;
            },
            set(prop, value) {
                if (prop === 'alpha') {
                    this.parent.alpha = value;
                    return;
                }

                const current = labToOklab(this.parent.#lab);
                if (prop === 'l') current.l = Color.#parseValue01(value);
                else if (prop === 'a') {
                    if (!isFiniteNumber(value)) throw new TypeError('OKLab.a must be Number');
                    current.a = value;
                }
                else if (prop === 'b') {
                    if (!isFiniteNumber(value)) throw new TypeError('OKLab.b must be Number');
                    current.b = value;
                }
                else return;

                const nextLab = oklabToLab(current);
                this.parent.#setLab(nextLab);
            },
            call(args) {
                const [l, a, b, alpha = this.parent.alpha] = args;
                const oklab = {
                    l: Color.#parseValue01(l),
                    a,
                    b
                };
                const nextLab = oklabToLab(oklab);
                this.parent.#setLab(nextLab);
                this.parent.alpha = alpha;
            },
            toString() {
                const { l, a, b } = labToOklab(this.parent.#lab);
                const lPct = `${formatNumber(l * 100, 4)}%`;
                const aStr = formatNumber(a, 5);
                const bStr = formatNumber(b, 5);
                const alpha = formatNumber(this.parent.alpha, 4);
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
                const oklab = labToOklab(this.parent.#lab);
                const oklch = oklabToOklch(oklab);
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

                const ok = labToOklab(this.parent.#lab);
                const current = oklabToOklch(ok);

                if (prop === 'l') current.l = Color.#parseValue01(value);
                else if (prop === 'c') {
                    if (!isFiniteNumber(value)) throw new TypeError('OKLCH.c must be Number');
                    current.c = Math.max(0, value);
                }
                else if (prop === 'h') {
                    if (!isFiniteNumber(value)) throw new TypeError('OKLCH.h must be Number');
                    current.h = value;
                }
                else return;

                const nextOkLab = oklchToOklab(current);
                const nextLab = oklabToLab(nextOkLab);
                this.parent.#setLab(nextLab);
            },
            call(args) {
                const [l, c, h, alpha = this.parent.alpha] = args;
                const oklchVal = {
                    l: Color.#parseValue01(l),
                    c: Math.max(0, c),
                    h
                };
                const nextOkLab = oklchToOklab(oklchVal);
                const nextLab = oklabToLab(nextOkLab);
                this.parent.#setLab(nextLab);
                this.parent.alpha = alpha;
            },
            toString() {
                const ok = labToOklab(this.parent.#lab);
                const { l, c, h } = oklabToOklch(ok);
                const lPct = `${formatNumber(l * 100, 4)}%`;
                const cStr = formatNumber(c, 5);
                const hStr = formatNumber(h, 2);
                const alpha = formatNumber(this.parent.alpha, 4);
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

    /**
     * linear-gradient 문자열 파서
     * @param {string} cssString - "linear-gradient(180deg, #fff 0%, #000 100%)" 형식
     * @returns {LinearGradient}
     */
    static fromString(cssString) {
        const match = cssString.match(/linear-gradient\((.*)\)/i);
        if (!match) return null;

        let content = match[1];

        const parts = content.split(/,(?![^(]*\))/).map(p => p.trim());

        let angle = 180;
        let mode = 'rgb';
        let stopsStartIdx = 0;

        const firstPart = parts[0];

        if (firstPart.startsWith('in ')) {
            mode = firstPart.replace('in ', '').trim();
            stopsStartIdx = 1;
            if (parts[1] && (parts[1].includes('deg') || parts[1].includes('to '))) {
                angle = this._parseAngle(parts[1]);
                stopsStartIdx = 2;
            }
        } else if (firstPart.includes('deg') || firstPart.includes('to ')) {
            angle = this._parseAngle(firstPart);
            stopsStartIdx = 1;
        }


        const rawStops = parts.slice(stopsStartIdx);
        const stops = rawStops.map((stopStr, idx) => {
            const stopMatch = stopStr.match(/(.*)\s+([\d.]+(?:%|px|deg)?)$/);

            let colorStr, pos;
            if (stopMatch) {
                colorStr = stopMatch[1].trim();
                pos = parseFloat(stopMatch[2]) / (stopMatch[2].includes('%') ? 100 : 1);
            } else {
                colorStr = stopStr.trim();
                pos = idx === 0 ? 0 : (idx === rawStops.length - 1 ? 1 : null);
            }

            return { color: colorStr, pos: pos };
        });

        // 5. 누락된 위치(null) 자동 계산 (균등 배분)
        this._fillMissingPositions(stops);

        return new LinearGradient(stops, angle, mode);
    }

    /** @private 각도/방향 문자열을 숫자로 변환 */
    static _parseAngle(angleStr) {
        if (angleStr.includes('deg')) return parseFloat(angleStr);
        const directions = {
            'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270,
            'to top right': 45, 'to bottom right': 135, 'to bottom left': 225, 'to top left': 315
        };
        return directions[angleStr.toLowerCase()] ?? 180;
    }

    /** @private 위치값이 없는 스톱들에 균등한 위치 할당 */
    static _fillMissingPositions(stops) {
        for (let i = 0; i < stops.length; i++) {
            if (stops[i].pos === null) {
                let j = i + 1;
                while (stops[j].pos === null) j++;
                const step = (stops[j].pos - stops[i - 1].pos) / (j - (i - 1));
                for (let k = i; k < j; k++) {
                    stops[k].pos = stops[i - 1].pos + step * (k - (i - 1));
                }
            }
        }
    }

    addStop(color, pos) {
        this.stops.push({ color, pos });
        this.stops.sort((a, b) => a.pos - b.pos);
        return this;
    }

    getColorAt(pos) {
        const colors = this.stops.map(s => s.color);
        const positions = this.stops.map(s => s.pos);

        const scale = Color.scale(colors).mode(this.mode);
        return scale(pos);
    }

    chainScale(grad) {
        return (t) => {
            const newDeg = this.angle + (grad.angle - this.angle) * t;

            const allPositions = new Set([
                ...this.stops.map(s => s.pos),
                ...grad.stops.map(s => s.pos)
            ]);

            const sortedPositions = Array.from(allPositions).sort((a, b) =>  a - b);

            const newStops = sortedPositions.map(pos => {
                const colorA = this.getColorAt(pos);
                const colorB = grad.getColorAt(pos);

                const mixedColor = Color.interpolate(colorA, colorB, t, grad.mode ?? this.mode);
                return { color: mixedColor, pos: pos };
            });

            return new LinearGradient(newStops, newDeg, grad.mode);
        }
    }

    css(mode = '') {
        const colorMode = (mode === '') ? this.mode : mode;
        if (this.stops.length === 0) return 'none';
        const stopStr = this.stops.map(stop => {
            const c = (stop.color && typeof stop.color.clone === 'function')
                ? stop.color.rgb.css()
                : stop.color;

            let positions = '';
            
            // auto percentage convert
            const formatPos = (val) => (val <= 1 ? val * 100 : val) + '%';

            if (Array.isArray(stop.pos)) {
                if (stop.pos.length > 2) {
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
    pct,
    Percent,
    Color,
    LinearGradient
};
