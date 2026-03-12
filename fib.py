#!/usr/bin/env python3
"""
Fibonacci Sequence Generator
Prints the first 20 Fibonacci numbers
"""

def fibonacci_sequence(n):
    """Generate first n Fibonacci numbers"""
    fib_numbers = []
    a, b = 0, 1
    for _ in range(n):
        fib_numbers.append(a)
        a, b = b, a + b
    return fib_numbers

def main():
    """Main function to print Fibonacci numbers"""
    n = 20
    print(f"First {n} Fibonacci numbers:")
    print("-" * 40)
    
    fib_numbers = fibonacci_sequence(n)
    
    for i, num in enumerate(fib_numbers, 1):
        print(f"{i:2}: {num}")
    
    print("-" * 40)
    print(f"Sum of first {n} Fibonacci numbers: {sum(fib_numbers)}")

if __name__ == "__main__":
    main()