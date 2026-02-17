/**
 * Service Benchmarks - Performance tests for critical TypeScript services
 *
 * Run with: pnpm --filter @agiworkforce/desktop bench
 * Or use Vitest directly: pnpm --filter @agiworkforce/desktop vitest run --config vitest.bench.config.ts
 */

import { describe, bench } from 'vitest';

// Helper function to measure execution time
function runBenchmark(fn: () => void, iterations: number = 1000): void {
  for (let i = 0; i < iterations; i++) {
    fn();
  }
}

describe('Cache Service Benchmarks', () => {
  bench('Cache get - hit', () => {
    const cache = new Map<string, string>();
    // Populate cache
    for (let i = 0; i < 1000; i++) {
      cache.set(`key_${i}`, `value_${i}`);
    }

    runBenchmark(() => {
      cache.get('key_500');
    });
  });

  bench('Cache get - miss', () => {
    const cache = new Map<string, string>();
    for (let i = 0; i < 1000; i++) {
      cache.set(`key_${i}`, `value_${i}`);
    }

    runBenchmark(() => {
      cache.get('nonexistent_key');
    });
  });

  bench('Cache set', () => {
    const cache = new Map<string, string>();

    runBenchmark(() => {
      cache.set(`key_${Math.floor(Math.random() * 1000)}`, 'value');
    }, 100);
  });

  bench('Cache has', () => {
    const cache = new Map<string, string>();
    for (let i = 0; i < 1000; i++) {
      cache.set(`key_${i}`, `value_${i}`);
    }

    runBenchmark(() => {
      cache.has('key_500');
    });
  });

  bench('Cache delete', () => {
    const cache = new Map<string, string>();
    for (let i = 0; i < 1000; i++) {
      cache.set(`key_${i}`, `value_${i}`);
    }

    runBenchmark(() => {
      cache.delete('key_500');
    }, 100);
  });

  bench('Cache clear', () => {
    const cache = new Map<string, string>();
    for (let i = 0; i < 1000; i++) {
      cache.set(`key_${i}`, `value_${i}`);
    }

    runBenchmark(() => {
      cache.clear();
    }, 10);
  });
});

describe('JSON Operations Benchmarks', () => {
  bench('JSON stringify - small object', () => {
    const data = { id: 1, name: 'Test', value: 100 };

    runBenchmark(() => {
      JSON.stringify(data);
    });
  });

  bench('JSON stringify - medium object', () => {
    const data = {
      id: 1,
      name: 'Test User',
      email: 'test@example.com',
      active: true,
      createdAt: '2024-01-01',
      metadata: { key: 'value' },
    };

    runBenchmark(() => {
      JSON.stringify(data);
    });
  });

  bench('JSON stringify - large object', () => {
    const items = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      name: `Item ${i}`,
      value: Math.random(),
      active: i % 2 === 0,
    }));
    const data = { items, total: items.length };

    runBenchmark(() => {
      JSON.stringify(data);
    }, 100);
  });

  bench('JSON parse - small object', () => {
    const json = '{"id":1,"name":"Test","value":100}';

    runBenchmark(() => {
      JSON.parse(json);
    });
  });

  bench('JSON parse - large object', () => {
    const items = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      name: `Item ${i}`,
      value: Math.random(),
    }));
    const json = JSON.stringify({ items });

    runBenchmark(() => {
      JSON.parse(json);
    }, 100);
  });
});

describe('String Operations Benchmarks', () => {
  bench('String split', () => {
    const text = 'hello world this is a test string';

    runBenchmark(() => {
      text.split(' ');
    });
  });

  bench('String replace', () => {
    const text = 'The quick brown fox jumps over the lazy dog';

    runBenchmark(() => {
      text.replace('fox', 'cat');
    });
  });

  bench('String replaceAll', () => {
    const text = 'hello hello hello world';

    runBenchmark(() => {
      text.replace(/hello/g, 'goodbye');
    });
  });

  bench('String includes', () => {
    const text = 'The quick brown fox jumps over the lazy dog';

    runBenchmark(() => {
      text.includes('fox');
    });
  });

  bench('String toLowerCase', () => {
    const text = 'HELLO WORLD TEST STRING';

    runBenchmark(() => {
      text.toLowerCase();
    });
  });

  bench('String template literal', () => {
    const id = 123;
    const name = 'Test';

    runBenchmark(() => {
      const result = `User ${id}: ${name}`;
      return result;
    });
  });
});

describe('Array Operations Benchmarks', () => {
  bench('Array map', () => {
    const arr = Array.from({ length: 1000 }, (_, i) => i);

    runBenchmark(() => {
      arr.map((x) => x * 2);
    }, 100);
  });

  bench('Array filter', () => {
    const arr = Array.from({ length: 1000 }, (_, i) => i);

    runBenchmark(() => {
      arr.filter((x) => x % 2 === 0);
    }, 100);
  });

  bench('Array find', () => {
    const arr = Array.from({ length: 1000 }, (_, i) => ({ id: i, value: i }));

    runBenchmark(() => {
      arr.find((x) => x.id === 500);
    });
  });

  bench('Array findIndex', () => {
    const arr = Array.from({ length: 1000 }, (_, i) => ({ id: i, value: i }));

    runBenchmark(() => {
      arr.findIndex((x) => x.id === 500);
    });
  });

  bench('Array reduce', () => {
    const arr = Array.from({ length: 1000 }, (_, i) => i);

    runBenchmark(() => {
      arr.reduce((sum, x) => sum + x, 0);
    }, 100);
  });

  bench('Array sort', () => {
    const arr = Array.from({ length: 100 }, () => Math.random());

    runBenchmark(() => {
      [...arr].sort((a, b) => a - b);
    }, 10);
  });

  bench('Array includes', () => {
    const arr = Array.from({ length: 1000 }, (_, i) => i);

    runBenchmark(() => {
      arr.includes(500);
    });
  });

  bench('Array push', () => {
    const arr: number[] = [];

    runBenchmark(() => {
      arr.push(1);
    }, 100);
  });
});

describe('Object Operations Benchmarks', () => {
  bench('Object keys', () => {
    const obj = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`key_${i}`, i]));

    runBenchmark(() => {
      Object.keys(obj);
    });
  });

  bench('Object values', () => {
    const obj = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`key_${i}`, i]));

    runBenchmark(() => {
      Object.values(obj);
    });
  });

  bench('Object entries', () => {
    const obj = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`key_${i}`, i]));

    runBenchmark(() => {
      Object.entries(obj);
    });
  });

  bench('Object assign', () => {
    const target = { a: 1 };
    const source = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`key_${i}`, i]));

    runBenchmark(() => {
      Object.assign({}, target, source);
    }, 100);
  });

  bench('Object spread', () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { c: 3, d: 4 };

    runBenchmark(() => {
      const merged = { ...obj1, ...obj2 };
      return merged;
    });
  });
});

describe('Date/Time Operations Benchmarks', () => {
  bench('Date.now', () => {
    runBenchmark(() => {
      Date.now();
    });
  });

  bench('new Date()', () => {
    runBenchmark(() => {
      new Date();
    });
  });

  bench('Date toISOString', () => {
    const date = new Date();

    runBenchmark(() => {
      date.toISOString();
    });
  });

  bench('Date getTime', () => {
    const date = new Date();

    runBenchmark(() => {
      date.getTime();
    });
  });
});

describe('URL Operations Benchmarks', () => {
  bench('URLSearchParams constructor', () => {
    const params = 'id=123&name=test&active=true';

    runBenchmark(() => {
      new URLSearchParams(params);
    });
  });

  bench('URLSearchParams get', () => {
    const searchParams = new URLSearchParams('id=123&name=test&active=true');

    runBenchmark(() => {
      searchParams.get('name');
    });
  });

  bench('URLSearchParams has', () => {
    const searchParams = new URLSearchParams('id=123&name=test&active=true');

    runBenchmark(() => {
      searchParams.has('name');
    });
  });
});

describe('Map Operations Benchmarks', () => {
  bench('Map get', () => {
    const map = new Map<string, number>();
    for (let i = 0; i < 1000; i++) {
      map.set(`key_${i}`, i);
    }

    runBenchmark(() => {
      map.get('key_500');
    });
  });

  bench('Map set', () => {
    const map = new Map<string, number>();

    runBenchmark(() => {
      map.set(`key_${Math.floor(Math.random() * 1000)}`, 1);
    }, 100);
  });

  bench('Map has', () => {
    const map = new Map<string, number>();
    for (let i = 0; i < 1000; i++) {
      map.set(`key_${i}`, i);
    }

    runBenchmark(() => {
      map.has('key_500');
    });
  });

  bench('Map delete', () => {
    const map = new Map<string, number>();
    for (let i = 0; i < 1000; i++) {
      map.set(`key_${i}`, i);
    }

    runBenchmark(() => {
      map.delete('key_500');
    }, 100);
  });
});

describe('Set Operations Benchmarks', () => {
  bench('Set has', () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      set.add(`item_${i}`);
    }

    runBenchmark(() => {
      set.has('item_500');
    });
  });

  bench('Set add', () => {
    const set = new Set<string>();

    runBenchmark(() => {
      set.add(`item_${Math.floor(Math.random() * 1000)}`);
    }, 100);
  });

  bench('Set delete', () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      set.add(`item_${i}`);
    }

    runBenchmark(() => {
      set.delete('item_500');
    }, 100);
  });
});

describe('RegExp Operations Benchmarks', () => {
  bench('RegExp test', () => {
    const regex = /^\d{3}-\d{4}$/;
    const text = '123-4567';

    runBenchmark(() => {
      regex.test(text);
    });
  });

  bench('RegExp match', () => {
    const regex = /\d+/g;
    const text = 'hello 123 world 456 test 789';

    runBenchmark(() => {
      text.match(regex);
    });
  });

  bench('RegExp replace', () => {
    const regex = /\d+/g;
    const text = '123 456 789';

    runBenchmark(() => {
      text.replace(regex, 'X');
    });
  });
});

describe('Async/Promise Benchmarks', () => {
  bench('Promise resolve', () => {
    runBenchmark(() => {
      Promise.resolve(1);
    });
  });

  bench('Promise then', async () => {
    const promise = Promise.resolve(1);

    runBenchmark(() => {
      promise.then((x) => x + 1);
    }, 10);
  });
});

describe('Crypto Operations Benchmarks', () => {
  bench('crypto.randomUUID', () => {
    runBenchmark(() => {
      crypto.randomUUID();
    }, 100);
  });

  bench('crypto.getRandomValues', () => {
    const buffer = new Uint8Array(32);

    runBenchmark(() => {
      crypto.getRandomValues(buffer);
    }, 100);
  });
});
