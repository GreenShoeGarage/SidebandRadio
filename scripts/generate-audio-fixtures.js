import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const output = resolve("fixtures/generated");
await mkdir(output, { recursive: true });

function wav({ seconds = 3, frequency = 440, amplitude = 0.2 }) {
  const rate = 44100, samples = Math.floor(rate * seconds), dataBytes = samples * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(36 + dataBytes, 4); buffer.write("WAVE", 8);
  buffer.write("fmt ", 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write("data", 36); buffer.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples; i++) {
    const fade = Math.min(1, i / 500, (samples - i - 1) / 500);
    const value = amplitude === 0 ? 0 : Math.sin(2 * Math.PI * frequency * i / rate) * amplitude * fade;
    buffer.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }
  return buffer;
}

const fixtures = [
  ["sideband-reference-440hz.wav", { frequency: 440, amplitude: 0.18 }],
  ["sideband-alignment-1000hz.wav", { frequency: 1000, amplitude: 0.14 }],
  ["sideband-silence-3s.wav", { frequency: 0, amplitude: 0 }],
];
for (const [name, options] of fixtures) await writeFile(resolve(output, name), wav(options));
console.log(`Generated ${fixtures.length} original test fixtures in ${output}`);
