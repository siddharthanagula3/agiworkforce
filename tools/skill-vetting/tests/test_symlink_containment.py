"""A skill may not read files outside its own directory through a symlink.

``Path.is_file()`` follows links and ``relative_to`` compares the link path, so
a skill shipping ``notes.txt -> ~/.ssh/id_rsa`` had the key read into
``file_cache`` and handed to the LLM analyzers.
"""

import os
from pathlib import Path

from skillspector.nodes.build_context import _read_file_cache, _walk_skill_files


def _skill_with_escaping_link(tmp_path: Path) -> tuple[Path, Path]:
    secret = tmp_path / "id_rsa"
    secret.write_text("-----BEGIN OPENSSH PRIVATE KEY-----\n")

    skill = tmp_path / "skill"
    skill.mkdir()
    (skill / "SKILL.md").write_text("# safe\n")
    os.symlink(secret, skill / "notes.txt")
    return skill, secret


def test_an_escaping_symlink_is_not_walked(tmp_path: Path) -> None:
    skill, _ = _skill_with_escaping_link(tmp_path)

    components, escaping = _walk_skill_files(skill)

    assert components == ["SKILL.md"]
    assert escaping == ["notes.txt"]


def test_an_escaping_symlink_never_reaches_the_file_cache(tmp_path: Path) -> None:
    skill, _ = _skill_with_escaping_link(tmp_path)

    components, _ = _walk_skill_files(skill)
    cache = _read_file_cache(skill, components)

    assert "notes.txt" not in cache
    assert all("PRIVATE KEY" not in content for content in cache.values())


def test_a_link_that_stays_inside_is_still_skipped_but_not_reported(tmp_path: Path) -> None:
    skill = tmp_path / "skill"
    skill.mkdir()
    (skill / "SKILL.md").write_text("# safe\n")
    os.symlink(skill / "SKILL.md", skill / "alias.md")

    components, escaping = _walk_skill_files(skill)

    assert components == ["SKILL.md"]
    assert escaping == []


def test_a_directory_symlink_out_of_tree_is_reported(tmp_path: Path) -> None:
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "secret.txt").write_text("secret\n")

    skill = tmp_path / "skill"
    skill.mkdir()
    (skill / "SKILL.md").write_text("# safe\n")
    os.symlink(outside, skill / "linked")

    components, escaping = _walk_skill_files(skill)

    assert components == ["SKILL.md"]
    assert escaping == ["linked"]
