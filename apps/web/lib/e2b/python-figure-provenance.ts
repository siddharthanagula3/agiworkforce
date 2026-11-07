export function pythonFigureProvenanceBootstrap(executionId: string): string {
  return String.raw`def _agi_install_figure_provenance():
    try:
        import hashlib
        import io
        import os
        import inspect
        import sys
        import matplotlib
        from matplotlib.backend_bases import FigureCanvasBase
    except ImportError:
        return
    previous = FigureCanvasBase.print_figure
    original = getattr(previous, "_agi_original_print_figure", previous)
    signature = inspect.signature(original)
    execution_id = ${JSON.stringify(executionId)}
    canonical_dpi = 100
    max_canonical_pixels = 4000000
    warned = False
    def report_unavailable():
        nonlocal warned
        if not warned:
            warned = True
            print("Chart output matching is unavailable for this run; all chart files are kept.", file=sys.stderr)
    def print_figure(canvas, filename, *args, **kwargs):
        try:
            bound = signature.bind(canvas, filename, *args, **kwargs)
            image_format = bound.arguments.get("format")
            if not image_format:
                try:
                    image_format = os.path.splitext(os.fspath(filename))[1].lstrip(".")
                except TypeError:
                    image_format = None
            image_format = image_format or canvas.get_default_filetype()
            if image_format.lower() == "png":
                width, height = canvas.figure.get_size_inches()
                if width * height * canonical_dpi * canonical_dpi <= max_canonical_pixels:
                    bounds = bound.arguments.get("bbox_inches")
                    canonical = io.BytesIO()
                    original(canvas, canonical, format="png", dpi=canonical_dpi,
                        bbox_inches=bounds if bounds is not None and not isinstance(bounds, str) else None,
                        facecolor=bound.arguments.get("facecolor"),
                        edgecolor=bound.arguments.get("edgecolor"),
                        backend="agg", metadata={"Software": "agi-figure-render-state-v1"})
                    digest = hashlib.sha256(canonical.getvalue())
                    metadata = dict(kwargs.get("metadata") or {})
                    metadata["agi-render-identity"] = "matplotlib-v1:" + execution_id + ":" + digest.hexdigest()
                    kwargs["metadata"] = metadata
                else:
                    report_unavailable()
        except Exception:
            report_unavailable()
        return original(canvas, filename, *args, **kwargs)
    print_figure._agi_original_print_figure = original
    FigureCanvasBase.print_figure = print_figure
_agi_install_figure_provenance()
del _agi_install_figure_provenance`;
}
