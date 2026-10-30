export const LUNA_QA_MATH_MARKDOWN = String.raw`Siddhartha, here are examples of **inline** and **block-level** mathematical typesetting.

Inline equations: Einstein’s mass–energy relation is \(E = mc^2\), and Bayes’ theorem is \(P(A\mid B)=\dfrac{P(B\mid A)P(A)}{P(B)}\).

**Quadratic formula**
\[
x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}
\]

**Matrix**
\[
\begin{bmatrix}
a_{11} & a_{12} & \cdots & a_{1n}\\
a_{21} & a_{22} & \cdots & a_{2n}\\
\vdots & \vdots & \ddots & \vdots\\
a_{m1} & a_{m2} & \cdots & a_{mn}
\end{bmatrix}
\]

**Definite integral**
\[
\int_a^b f(x)\,dx
\]

**Summation**
\[
\sum_{k=1}^{n} k=\frac{n(n+1)}{2}
\]`;

export const LUNA_QA_MATH_EXPRESSIONS = [
  String.raw`E = mc^2`,
  String.raw`P(A\mid B)=\dfrac{P(B\mid A)P(A)}{P(B)}`,
  String.raw`x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}`,
  String.raw`\begin{bmatrix}
a_{11} & a_{12} & \cdots & a_{1n}\\
a_{21} & a_{22} & \cdots & a_{2n}\\
\vdots & \vdots & \ddots & \vdots\\
a_{m1} & a_{m2} & \cdots & a_{mn}
\end{bmatrix}`,
  String.raw`\int_a^b f(x)\,dx`,
  String.raw`\sum_{k=1}^{n} k=\frac{n(n+1)}{2}`,
] as const;
