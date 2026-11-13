//! TeX math as plain terminal text. A terminal cannot typeset, so a formula is
//! read the way a person would type it: `\frac{r}{n}` as `r/n`, exponents and
//! indices as Unicode super- and subscripts where every character has one, and
//! named symbols as their Unicode characters.

pub(crate) fn latex_to_text(source: &str) -> String {
    let chars: Vec<char> = source.chars().collect();
    let mut at = 0;
    let text = sequence(&chars, &mut at, false);
    tidy(&text)
}

fn tidy(text: &str) -> String {
    text.lines()
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn sequence(chars: &[char], at: &mut usize, in_group: bool) -> String {
    let mut out = String::new();
    while *at < chars.len() {
        let ch = chars[*at];
        match ch {
            '}' if in_group => {
                *at += 1;
                return out;
            }
            '{' => {
                *at += 1;
                out.push_str(&sequence(chars, at, true));
            }
            '\\' => out.push_str(&command(chars, at)),
            '^' | '_' => {
                *at += 1;
                let argument = argument(chars, at);
                out.push_str(&script(&argument, ch == '^'));
            }
            '~' => {
                *at += 1;
                out.push(' ');
            }
            '&' => {
                *at += 1;
                out.push(' ');
            }
            _ => {
                *at += 1;
                out.push(ch);
            }
        }
    }
    out
}

fn argument(chars: &[char], at: &mut usize) -> String {
    while *at < chars.len() && chars[*at].is_whitespace() {
        *at += 1;
    }
    match chars.get(*at) {
        Some('{') => {
            *at += 1;
            sequence(chars, at, true)
        }
        Some('\\') => command(chars, at),
        Some(&ch) => {
            *at += 1;
            ch.to_string()
        }
        None => String::new(),
    }
}

fn optional_argument(chars: &[char], at: &mut usize) -> Option<String> {
    if chars.get(*at) != Some(&'[') {
        return None;
    }
    let close = chars[*at..].iter().position(|ch| *ch == ']')? + *at;
    let inner: String = chars[*at + 1..close].iter().collect();
    *at = close + 1;
    Some(latex_to_text(&inner))
}

fn command(chars: &[char], at: &mut usize) -> String {
    *at += 1;
    let start = *at;
    while *at < chars.len() && chars[*at].is_ascii_alphabetic() {
        *at += 1;
    }
    if *at == start {
        let Some(&symbol) = chars.get(*at) else {
            return String::new();
        };
        *at += 1;
        return match symbol {
            ',' | ':' | ';' | ' ' => " ".to_string(),
            '!' => String::new(),
            '\\' => "\n".to_string(),
            other => other.to_string(),
        };
    }
    let name: String = chars[start..*at].iter().collect();
    match name.as_str() {
        "frac" | "dfrac" | "tfrac" | "cfrac" => {
            let numerator = argument(chars, at);
            let denominator = argument(chars, at);
            format!("{}/{}", operand(&numerator), operand(&denominator))
        }
        "sqrt" => {
            let index = optional_argument(chars, at);
            let radicand = operand(&argument(chars, at));
            match index.as_deref() {
                Some("3") => format!("∛{radicand}"),
                Some("4") => format!("∜{radicand}"),
                Some(other) => format!("{}√{radicand}", script(other, true)),
                None => format!("√{radicand}"),
            }
        }
        "left" | "right" | "bigl" | "bigr" | "Bigl" | "Bigr" | "big" | "Big" | "bigg" | "Bigg"
        | "biggl" | "biggr" | "Biggl" | "Biggr" => {
            let delimiter = argument(chars, at);
            if delimiter == "." {
                String::new()
            } else {
                delimiter
            }
        }
        "text" | "textrm" | "textbf" | "textit" | "mathrm" | "mathbf" | "mathit" | "mathsf"
        | "mathtt" | "operatorname" | "boldsymbol" | "mbox" => {
            let raw = raw_group(chars, at);
            if name.starts_with("text") || name == "mbox" {
                raw
            } else {
                latex_to_text(&raw)
            }
        }
        "mathbb" => {
            let letter = argument(chars, at);
            blackboard(&letter).unwrap_or(letter)
        }
        "hat" | "bar" | "overline" | "vec" | "dot" | "ddot" | "tilde" | "widehat" | "widetilde" => {
            let base = argument(chars, at);
            accent(&name, &base)
        }
        "begin" | "end" => {
            raw_group(chars, at);
            if name == "end" {
                "\n".to_string()
            } else {
                String::new()
            }
        }
        "quad" => "  ".to_string(),
        "qquad" => "    ".to_string(),
        _ => symbol(&name)
            .map(str::to_string)
            .unwrap_or_else(|| name.clone()),
    }
}

fn raw_group(chars: &[char], at: &mut usize) -> String {
    while *at < chars.len() && chars[*at].is_whitespace() {
        *at += 1;
    }
    if chars.get(*at) != Some(&'{') {
        return String::new();
    }
    let mut depth = 0usize;
    let start = *at + 1;
    while *at < chars.len() {
        match chars[*at] {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    let inner: String = chars[start..*at].iter().collect();
                    *at += 1;
                    return inner;
                }
            }
            _ => {}
        }
        *at += 1;
    }
    chars[start.min(chars.len())..].iter().collect()
}

fn operand(text: &str) -> String {
    let text = text.trim();
    let simple = text.chars().count() <= 1
        || text
            .chars()
            .all(|ch| ch.is_alphanumeric() || ch == '.' || is_script_char(ch));
    if simple {
        text.to_string()
    } else {
        format!("({text})")
    }
}

fn script(text: &str, superscript: bool) -> String {
    let text = text.trim();
    let mapped: Option<String> = text
        .chars()
        .map(|ch| {
            if superscript {
                superscript_char(ch)
            } else {
                subscript_char(ch)
            }
        })
        .collect();
    match mapped {
        Some(mapped) if !mapped.is_empty() => mapped,
        _ => {
            let mark = if superscript { '^' } else { '_' };
            if text.chars().count() == 1 {
                format!("{mark}{text}")
            } else {
                format!("{mark}({text})")
            }
        }
    }
}

fn is_script_char(ch: char) -> bool {
    "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻ₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ".contains(ch)
}

fn superscript_char(ch: char) -> Option<char> {
    Some(match ch {
        '0' => '⁰',
        '1' => '¹',
        '2' => '²',
        '3' => '³',
        '4' => '⁴',
        '5' => '⁵',
        '6' => '⁶',
        '7' => '⁷',
        '8' => '⁸',
        '9' => '⁹',
        '+' => '⁺',
        '-' | '−' => '⁻',
        '=' => '⁼',
        '(' => '⁽',
        ')' => '⁾',
        'a' => 'ᵃ',
        'b' => 'ᵇ',
        'c' => 'ᶜ',
        'd' => 'ᵈ',
        'e' => 'ᵉ',
        'f' => 'ᶠ',
        'g' => 'ᵍ',
        'h' => 'ʰ',
        'i' => 'ⁱ',
        'j' => 'ʲ',
        'k' => 'ᵏ',
        'l' => 'ˡ',
        'm' => 'ᵐ',
        'n' => 'ⁿ',
        'o' => 'ᵒ',
        'p' => 'ᵖ',
        'r' => 'ʳ',
        's' => 'ˢ',
        't' => 'ᵗ',
        'u' => 'ᵘ',
        'v' => 'ᵛ',
        'w' => 'ʷ',
        'x' => 'ˣ',
        'y' => 'ʸ',
        'z' => 'ᶻ',
        '′' => '′',
        _ => return None,
    })
}

fn subscript_char(ch: char) -> Option<char> {
    Some(match ch {
        '0' => '₀',
        '1' => '₁',
        '2' => '₂',
        '3' => '₃',
        '4' => '₄',
        '5' => '₅',
        '6' => '₆',
        '7' => '₇',
        '8' => '₈',
        '9' => '₉',
        '+' => '₊',
        '-' | '−' => '₋',
        '=' => '₌',
        '(' => '₍',
        ')' => '₎',
        'a' => 'ₐ',
        'e' => 'ₑ',
        'h' => 'ₕ',
        'i' => 'ᵢ',
        'j' => 'ⱼ',
        'k' => 'ₖ',
        'l' => 'ₗ',
        'm' => 'ₘ',
        'n' => 'ₙ',
        'o' => 'ₒ',
        'p' => 'ₚ',
        'r' => 'ᵣ',
        's' => 'ₛ',
        't' => 'ₜ',
        'u' => 'ᵤ',
        'v' => 'ᵥ',
        'x' => 'ₓ',
        _ => return None,
    })
}

fn accent(name: &str, base: &str) -> String {
    let mark = match name {
        "hat" | "widehat" => '\u{0302}',
        "bar" | "overline" => '\u{0304}',
        "vec" => '\u{20D7}',
        "dot" => '\u{0307}',
        "ddot" => '\u{0308}',
        _ => '\u{0303}',
    };
    if base.chars().count() == 1 {
        format!("{base}{mark}")
    } else {
        base.to_string()
    }
}

fn blackboard(letter: &str) -> Option<String> {
    Some(
        match letter {
            "R" => "ℝ",
            "N" => "ℕ",
            "Z" => "ℤ",
            "Q" => "ℚ",
            "C" => "ℂ",
            "P" => "ℙ",
            "E" => "𝔼",
            _ => return None,
        }
        .to_string(),
    )
}

fn symbol(name: &str) -> Option<&'static str> {
    Some(match name {
        "alpha" => "α",
        "beta" => "β",
        "gamma" => "γ",
        "delta" => "δ",
        "epsilon" | "varepsilon" => "ε",
        "zeta" => "ζ",
        "eta" => "η",
        "theta" | "vartheta" => "θ",
        "iota" => "ι",
        "kappa" => "κ",
        "lambda" => "λ",
        "mu" => "μ",
        "nu" => "ν",
        "xi" => "ξ",
        "pi" | "varpi" => "π",
        "rho" | "varrho" => "ρ",
        "sigma" | "varsigma" => "σ",
        "tau" => "τ",
        "upsilon" => "υ",
        "phi" | "varphi" => "φ",
        "chi" => "χ",
        "psi" => "ψ",
        "omega" => "ω",
        "Gamma" => "Γ",
        "Delta" => "Δ",
        "Theta" => "Θ",
        "Lambda" => "Λ",
        "Xi" => "Ξ",
        "Pi" => "Π",
        "Sigma" => "Σ",
        "Upsilon" => "Υ",
        "Phi" => "Φ",
        "Psi" => "Ψ",
        "Omega" => "Ω",
        "cdot" => "·",
        "times" => "×",
        "div" => "÷",
        "pm" => "±",
        "mp" => "∓",
        "le" | "leq" => "≤",
        "ge" | "geq" => "≥",
        "ne" | "neq" => "≠",
        "approx" => "≈",
        "equiv" => "≡",
        "sim" => "∼",
        "simeq" => "≃",
        "propto" => "∝",
        "infty" => "∞",
        "sum" => "∑",
        "prod" => "∏",
        "int" => "∫",
        "iint" => "∬",
        "oint" => "∮",
        "partial" => "∂",
        "nabla" => "∇",
        "to" | "rightarrow" => "→",
        "leftarrow" | "gets" => "←",
        "leftrightarrow" => "↔",
        "Rightarrow" => "⇒",
        "Leftarrow" => "⇐",
        "Leftrightarrow" => "⇔",
        "implies" => "⟹",
        "iff" => "⟺",
        "mapsto" => "↦",
        "in" => "∈",
        "notin" => "∉",
        "ni" => "∋",
        "subset" => "⊂",
        "subseteq" => "⊆",
        "supset" => "⊃",
        "supseteq" => "⊇",
        "cup" => "∪",
        "cap" => "∩",
        "setminus" => "∖",
        "forall" => "∀",
        "exists" => "∃",
        "neg" | "lnot" => "¬",
        "land" | "wedge" => "∧",
        "lor" | "vee" => "∨",
        "emptyset" | "varnothing" => "∅",
        "cdots" | "dots" | "ldots" | "dotsc" | "dotsb" => "…",
        "vdots" => "⋮",
        "ddots" => "⋱",
        "circ" => "∘",
        "degree" => "°",
        "angle" => "∠",
        "perp" => "⊥",
        "parallel" => "∥",
        "prime" => "′",
        "langle" => "⟨",
        "rangle" => "⟩",
        "lfloor" => "⌊",
        "rfloor" => "⌋",
        "lceil" => "⌈",
        "rceil" => "⌉",
        "mid" | "vert" => "|",
        "Vert" => "‖",
        "lbrace" => "{",
        "rbrace" => "}",
        "ell" => "ℓ",
        "hbar" => "ℏ",
        "star" => "⋆",
        "bullet" => "•",
        "oplus" => "⊕",
        "otimes" => "⊗",
        "displaystyle" | "textstyle" | "limits" | "nolimits" => "",
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::latex_to_text;

    #[test]
    fn compound_interest_reads_as_typed_text() {
        assert_eq!(
            latex_to_text(r"A = P\left(1 + \frac{r}{n}\right)^{nt}"),
            "A = P(1 + r/n)ⁿᵗ"
        );
        assert_eq!(latex_to_text(r"A = Pe^{rt}"), "A = Peʳᵗ");
        assert_eq!(latex_to_text("E = mc^2"), "E = mc²");
    }

    #[test]
    fn fractions_roots_and_symbols_have_plain_forms() {
        assert_eq!(latex_to_text(r"\frac{a+b}{2}"), "(a+b)/2");
        assert_eq!(latex_to_text(r"\sqrt{x^2 + y^2}"), "√(x² + y²)");
        assert_eq!(
            latex_to_text(r"\sum_{i=1}^{n} x_i \le \infty"),
            "∑ᵢ₌₁ⁿ xᵢ ≤ ∞"
        );
        assert_eq!(latex_to_text(r"\alpha \cdot \beta"), "α · β");
        assert_eq!(latex_to_text(r"x^{q}"), "x^q");
        assert_eq!(latex_to_text(r"\text{rate } r"), "rate r");
    }
}
