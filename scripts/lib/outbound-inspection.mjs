/** The outbound channels the inspection declares, read from its own source. */
export function declaredChannels(source) {
  const match = source.match(/export type OutboundChannel\s*=\s*([^;]+);/);
  if (!match) return null;
  return [...match[1].matchAll(/'([\w_]+)'/g)].map((entry) => entry[1]);
}

/** The channels a module actually asks the inspection to run. */
export function wiredChannels(source) {
  const channels = new Set();
  for (const match of source.matchAll(/inspectOutboundContent\(/g)) {
    const channel = source.slice(match.index, match.index + 800).match(/channel:\s*'([\w_]+)'/);
    if (channel) channels.add(channel[1]);
  }
  return channels;
}

/** The channels the registered scanners claim to cover. */
export function scannerChannels(source) {
  const channels = new Set();
  for (const match of source.matchAll(/channels:\s*\[([^\]]*)\]/g)) {
    for (const entry of match[1].matchAll(/'([\w_]+)'/g)) channels.add(entry[1]);
  }
  return channels;
}
