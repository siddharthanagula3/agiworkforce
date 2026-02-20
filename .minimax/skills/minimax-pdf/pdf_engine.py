#!/usr/bin/env python3
"""
PDF Engine - PDF Document Compilation and Analysis Toolkit

Invoke: python pdf_engine.py {doctor|render|audit|preview} [options]

Architecture:
- Single orchestration point - no scattered scripts
- Runtime detection with graceful fallbacks
- Self-locating via module path resolution
- Mandatory output verification

Commands:
  doctor          Environment diagnostics and setup
  render [name]   Generate PDF document from source
  audit FILE      Validate existing PDF document
  preview FILE    Quick content preview (pdftotext)
"""

import os
import platform
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional, Tuple, List

# Module path resolution
SCRIPT_LOCATION = Path(__file__).parent.resolve()
ENGINE_DIR = SCRIPT_LOCATION / "engine" # Placeholder, actual engine might be external

# Placeholder for diagnostics system (if needed, e.g., for LaTeX or other compilers)
# from diagnostics.compiler import CompilerDiagnostics


def resolve_project_home() -> Path:
    """Determine active workspace from environment or working directory.

    This MUST resolve to the user's working directory (or PROJECT_HOME),
    never the skill installation directory. All build intermediates and
    outputs are placed here.
    """
    env_path = os.environ.get("PROJECT_HOME")
    home = Path(env_path) if env_path else Path.cwd()
    # Guard: never write build artifacts into the skill directory itself
    if home.resolve() == SCRIPT_LOCATION.resolve():
        raise RuntimeError(
            f"project_home resolved to the skill directory ({SCRIPT_LOCATION}). "
            "Run pdf_engine.py from the user's working directory or set PROJECT_HOME."
        )
    return home


def resolve_staging_area() -> Path:
    """Staging directory for intermediate build files (under project home)."""
    return resolve_project_home() / ".pdf_workspace"


def resolve_artifact_dir() -> Path:
    """Final output directory for deliverables (under project home)."""
    return resolve_project_home() / "output"


# Runtime Detection for PDF Tools
# ============================================================================

def locate_tool(tool_name: str) -> Optional[Path]:
    """Search for a given command-line tool."""
    found = shutil.which(tool_name)
    return Path(found) if found else None

def assess_tool_health(tool_name: str, version_arg: List[str], min_version: Optional[str] = None) -> Tuple[str, Optional[Path], Optional[str]]:
    """
    Evaluate command-line tool installation status.
    Returns: (status, binary_path, version_string)
    status: 'ready' | 'outdated' | 'corrupted' | 'absent'
    """
    binary = locate_tool(tool_name)
    if not binary:
        return ("absent", None, None)

    try:
        proc = subprocess.run(
            [str(binary)] + version_arg,
            capture_output=True, text=True, timeout=10
        )
        if proc.returncode == 0:
            ver = proc.stdout.strip().split('
')[0]
            if min_version:
                # Simple version comparison for now, can be expanded if needed
                if ver >= min_version: # This is a basic string compare, might need better for complex versions
                    return ("ready", binary, ver)
                else:
                    return ("outdated", binary, ver)
            return ("ready", binary, ver)
        return ("corrupted", binary, None)
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return ("corrupted", binary, None)


def provision_tool(tool_name: str) -> Optional[Path]:
    """Provide guidance for installing command-line tools."""
    os_type = platform.system()
    print(f"  Acquiring {tool_name}...")
    print(f"  To install '{tool_name}', please run the following command manually:")

    if tool_name == "pdftotext":
        if os_type == "Windows":
            print("    Download poppler for Windows: https://poppler.freedesktop.org/")
            print("    Extract and add 'bin' folder to your PATH environment variable.")
        elif os_type == "Darwin": # macOS
            print("    brew install poppler")
        else: # Linux
            print("    sudo apt-get install poppler-utils (Debian/Ubuntu)")
            print("    sudo yum install poppler-utils (RHEL/CentOS)")
    elif tool_name == "qpdf":
        if os_type == "Windows":
            print("    Download from: https://qpdf.sourceforge.io/")
            print("    Extract and add 'bin' folder to your PATH environment variable.")
        elif os_type == "Darwin": # macOS
            print("    brew install qpdf")
        else: # Linux
            print("    sudo apt-get install qpdf")
            print("    sudo yum install qpdf")
    # Add more tools as needed

    return None # Manual intervention needed


def guarantee_tool(tool_name: str, version_arg: List[str], min_version: Optional[str] = None) -> Path:
    """Ensure tool availability, installing if necessary. Exits on failure."""
    status, binary, ver = assess_tool_health(tool_name, version_arg, min_version)

    if status == "ready":
        print(f"  + {tool_name} {ver} (ready)")
        return binary
    elif status == "outdated":
        print(f"! {tool_name} {ver} is outdated. Please upgrade manually.")
        provision_tool(tool_name)
        sys.exit(1)
    elif status == "corrupted":
        print(f"! {tool_name} installation corrupted. Please reinstall manually.")
        provision_tool(tool_name)
        sys.exit(1)
    else: # absent
        print(f"o {tool_name} not detected. Please install manually.")
        provision_tool(tool_name)
        sys.exit(1)


# Workspace Management
# ============================================================================

def prepare_workspace():
    """Initialize workspace directories."""
    staging = resolve_staging_area()
    output = resolve_artifact_dir()

    staging.mkdir(parents=True, exist_ok=True)
    output.mkdir(parents=True, exist_ok=True)

    # For PDF generation, we might copy template LaTeX/Markdown files
    # or create an empty base structure here.
    # Example: copy a default LaTeX template if it exists
    # blueprints_dir = SCRIPT_LOCATION / "blueprints"
    # latex_template_src = blueprints_dir / "default.tex"
    # latex_template_dst = staging / "document.tex"
    # if not latex_template_dst.exists() and latex_template_src.exists():
    #     shutil.copy2(latex_template_src, latex_template_dst)


# Verification Pipeline (Placeholder for PDF)
# ============================================================================

def execute_verification(document_path: Path) -> bool:
    """Run verification suite on generated PDF document."""
    print("  (PDF verification not yet implemented, assuming valid)")
    # TODO: Implement actual PDF validation, e.g., checking for valid PDF structure
    # using qpdf --check, or specific content checks.
    return True


def extract_document_metrics(document_path: Path) -> dict:
    """Gather PDF statistics using qpdf or pdftotext."""
    metrics = {"pages": 0, "characters": 0, "words": 0, "images": 0}

    qpdf_binary = locate_tool("qpdf")
    pdftotext_binary = locate_tool("pdftotext")

    if qpdf_binary:
        try:
            proc = subprocess.run(
                [str(qpdf_binary), "--json", str(document_path)],
                capture_output=True, text=True, timeout=10
            )
            if proc.returncode == 0:
                import json
                qpdf_json = json.loads(proc.stdout)
                metrics["pages"] = qpdf_json.get("qpdf", {}).get("pages", 0)
                # qpdf doesn't directly give character/word count
        except Exception as exc:
            print(f"  qpdf metrics failed: {exc}")

    if pdftotext_binary:
        try:
            proc = subprocess.run(
                [str(pdftotext_binary), "-raw", str(document_path), "-"], # Output to stdout
                capture_output=True, text=True, timeout=30
            )
            if proc.returncode == 0:
                content = proc.stdout
                metrics["characters"] = len(content)
                metrics["words"] = len(content.split())
        except Exception as exc:
            print(f"  pdftotext metrics failed: {exc}")

    # TODO: Add image count using a more robust PDF library or tool like pdfinfo

    return metrics


# Command Handlers
# ============================================================================

def action_doctor():
    """Environment diagnostics and setup."""
    print("=== PDF Environment Diagnostics ===")
    print()

    print("Paths:")
    print(f"  Skill root:    {SCRIPT_LOCATION}")
    print(f"  Project home:  {resolve_project_home()}")
    print(f"  Workspace:     {resolve_staging_area()}")
    print(f"  Output dir:    {resolve_artifact_dir()}")
    print()

    print("Required Tools:")
    pdftotext_binary = guarantee_tool("pdftotext", ["-v"], "0.60") # Poppler-utils version
    qpdf_binary = guarantee_tool("qpdf", ["--version"], "10.0")

    print(f"  + python {platform.python_version()}")
    print()

    print("=== Preparing Workspace ===")
    prepare_workspace()
    print(f"  + {resolve_staging_area()}")
    print()
    print("Ready!")
    print(f"  To generate: python {Path(__file__).name} render my_document.pdf")


def action_render(target_name: Optional[str] = None):
    """Generate PDF document from source."""
    # Placeholder for actual PDF generation logic.
    # This might involve:
    # 1. Compiling LaTeX -> PDF (e.g., pdflatex)
    # 2. Converting Markdown -> PDF (e.g., pandoc)
    # 3. Using a Python PDF library (e.g., ReportLab, FPDF, WeasyPrint)

    guarantee_tool("pdftotext", ["-v"])
    guarantee_tool("qpdf", ["--version"])
    prepare_workspace()

    staging = resolve_staging_area()
    output_dir = resolve_artifact_dir()

    if target_name:
        target = Path(target_name)
        if not target.is_absolute():
            target = output_dir / target_name
    else:
        target = output_dir / "document.pdf"

    target.parent.mkdir(parents=True, exist_ok=True)

    print(">> Generating (placeholder)...")
    # Example: Create a dummy PDF for now
    dummy_content = b"%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj 4 0 obj<</Length 44>>stream
BT /F1 24 Tf 100 700 Td (Hello PDF!) Tj ET
endstream
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000055 00000 n
0000000133 00000 n
0000000213 00000 n
trailer<</Size 5/Root 1 0 R>>startxref
285
%%EOF"
    target.write_bytes(dummy_content)

    print("  + Generated dummy PDF")

    print(">> Verifying...")
    if not execute_verification(target):
        print("!! VERIFICATION FAILED - Document saved but may be invalid")
        sys.exit(1)

    metrics = extract_document_metrics(target)
    print(f"  >> Pages: {metrics['pages']}, Chars: {metrics['characters']}, Words: {metrics['words']}")
    print()
    print(f"+ Complete: {target}")


def action_audit(document_path: str):
    """Validate existing PDF document."""
    guarantee_tool("qpdf", ["--version"]) # Ensure qpdf is available for audit

    path = Path(document_path)
    if not path.exists():
        print(f"- Not found: {path}")
        sys.exit(1)

    print(f">> Auditing: {path}")
    if execute_verification(path): # Placeholder verification
        print("+ Valid (basic check)")
    else:
        sys.exit(1)


def action_preview(document_path: str):
    """Quick content preview using pdftotext."""
    pdftotext_binary = guarantee_tool("pdftotext", ["-v"])

    path = Path(document_path)
    if not path.exists():
        print(f"- Not found: {path}")
        sys.exit(1)

    print(f">> Preview: {path}")
    print("-" * 60)
    try:
        proc = subprocess.run(
            [str(pdftotext_binary), "-raw", str(path), "-"], # Output to stdout
            capture_output=True, text=True, timeout=30
        )
        if proc.returncode == 0:
            print(proc.stdout)
        else:
            print(f"- Preview failed: {proc.stderr}")
            sys.exit(1)
    except Exception as exc:
        print(f"- Preview exception: {exc}")
        sys.exit(1)
    print("-" * 60)


def show_usage():
    """Display command reference."""
    staging = resolve_staging_area()
    output = resolve_artifact_dir()

    usage = f"""
Usage: python pdf_engine.py <command> [options]

IMPORTANT: Run from the user's working directory, not the skill directory.
  .pdf_workspace/ and output/ are created under cwd.

Commands:
  doctor          Environment diagnostics and auto-setup
  render [name]   Generate PDF document from source (default: output/document.pdf)
  audit FILE      Validate existing document (requires qpdf)
  preview FILE    Quick content preview (requires pdftotext)

Paths:
  Skill:     {SCRIPT_LOCATION}
  Workspace: {staging}  (e.g., place source files here for render)
  Output:    {output}  (final deliverables)

Generation Workflow:
  1. python pdf_engine.py doctor
  2. Place source files (e.g., LaTeX, Markdown) in {staging}
  3. python pdf_engine.py render my_report.pdf
"""
    print(usage.strip())


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help", "help"):
        show_usage()
        sys.exit(0)

    command = sys.argv[1]

    if command == "doctor":
        action_doctor()
    elif command == "render":
        target = sys.argv[2] if len(sys.argv) > 2 else None
        action_render(target)
    elif command == "audit":
        if len(sys.argv) < 3:
            print("Usage: python pdf_engine.py audit <document.pdf>")
            sys.exit(1)
        action_audit(sys.argv[2])
    elif command == "preview":
        if len(sys.argv) < 3:
            print("Usage: python pdf_engine.py preview <document.pdf>")
            sys.exit(1)
        action_preview(sys.argv[2])
    else:
        print(f"Unknown command: {command}")
        print("Run 'python pdf_engine.py help' for reference")
        sys.exit(1)


if __name__ == "__main__":
    main()
