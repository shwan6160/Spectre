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
        const colors = this.stops.map(s => s.color);
        const positions = this.stops.map(s => s.pos);

        const scale = chroma.scale(colors).domain(positions).mode('lch');
        
        return scale(pos);
    }

    morph(gradB, t) {
        const easedT = 1 - Math.pow(1 - t, 3);

        const newDeg = this.angle + (gradB.angle - this.angle) * easedT;

        const allPositions = new Set([
            ...this.stops.map(s => s.pos),
            ...gradB.stops.map(s => s.pos)
        ]);
        
        const sortedPositions = Array.from(allPositions).sort((a, b) => a - b);

        const newStops = sortedPositions.map(pos => {
            const colorA = this.getColorAt(pos);
            const colorB = gradB.getColorAt(pos);

            const mixedColor = colorEaseOut(colorA, colorB, easedT);

            return { color: mixedColor, pos: pos };
        });

        return new LinearGradient(newStops, newDeg, gradB.mode);
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
    LinearGradient
};
