jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: () => jest.fn().mockReturnValue(null) }),
);

import { customizeDestinations } from '../CustomizeScreen';

describe('customize hub', () => {
  it('puts plugins, skills, connectors and agents behind one destination', () => {
    expect(customizeDestinations({ skills: true }).map((destination) => destination.route)).toEqual(
      ['/(app)/plugins', '/(app)/skills', '/(app)/connectors', '/(app)/agents'],
    );
  });

  it('drops Skills when the build has them turned off', () => {
    expect(customizeDestinations({ skills: false }).map((destination) => destination.key)).toEqual([
      'plugins',
      'connectors',
      'agents',
    ]);
  });
});
