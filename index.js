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

    get alpha() {
        return this.#alpha;
    }

    set alpha(value) {
        if (typeof value === 'number') {
            if(value >= 0 && value <= 100) {
                this.#alpha = pct(value * 100);
                return true;
            } else {
                throw new Error("ValueError: If value of Color.alpha is Number, it must be at least 0, up to 1.");
            }
        } else if ( value instanceof Percent ) {
            this.#alpha = value;
        } else {
            throw new TypeError("Value of Color.alpha must be Percent or Number");
        }
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
            const string  = `lab(${proxy.l} ${proxy.a} ${proxy.b} / ${parent.alpha})`;

            return string;
        }

        const proxy = new Proxy(target, {
            get(target, prop) {
                if (prop === "toString") {
                    return css();
                } else {
                    return parent.#lab[prop];
                }
            },
            set(target, prop, value) {
                try {
                    parent.#lab[prop] = value;
                    return true;
                } catch(e) {
                    console.warn("Color Update Falied.");
                    throw e;
                }
            }
        });

        return proxy;
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
