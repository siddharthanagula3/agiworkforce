const GLUED_STATEMENT =
  /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\))(?=(?:print|return|if|elif|else|for|while|def|class|import|from|try|except|finally|with|async|await|raise|yield|pass|break|continue)\b)/g;

/**
 * An edit that drops the newline between two Python statements leaves
 * `message = "UPDATED_VALUE"print(message)`. Put the statement break back.
 * A newline that is already there does not match, and a word inside a string
 * is not a statement start.
 */
export function separateGluedStatements(code: string): string {
  return code.replace(GLUED_STATEMENT, '$1\n');
}
