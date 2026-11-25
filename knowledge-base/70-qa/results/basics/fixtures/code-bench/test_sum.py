import unittest
from sum import add


class ParcelTotalsTest(unittest.TestCase):
    def test_combines_two_counts(self):
        self.assertEqual(add(17, 19), 36)
