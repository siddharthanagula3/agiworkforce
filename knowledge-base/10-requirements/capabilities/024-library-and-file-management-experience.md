---
id: "REQ-AREA-024"
type: "requirements"
title: "Requirement items: Library and file-management experience"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 24. Library and file-management experience

40 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S24.01

**All-files view.** One Library view lists every file the user owns across chats, generation, uploads and projects.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI missing, VS Code missing, Chrome missing
- Feature: [F024-01 Browse by source: All files, Uploads, Generated files, Artifacts](../../20-features/024-library-and-file-management-experience/F024-01-browse-by-source-all-files-uploads-generated-files.md)
- Competitor trace: CAP-files-and-attachments-18

## S24.02

**Uploaded-files view.** A view shows only the files the user uploaded.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F024-01 Browse by source: All files, Uploads, Generated files, Artifacts](../../20-features/024-library-and-file-management-experience/F024-01-browse-by-source-all-files-uploads-generated-files.md)
- Competitor trace: CAP-files-and-attachments-18

## S24.03

**Generated-files view.** A view shows only files the assistant generated.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F024-01 Browse by source: All files, Uploads, Generated files, Artifacts](../../20-features/024-library-and-file-management-experience/F024-01-browse-by-source-all-files-uploads-generated-files.md)
- Competitor trace: CAP-files-and-attachments-18, CAP-files-and-attachments-25

## S24.04

**Artifact view.** A view lists the user's artifacts and opens each one.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Seen in a real run: Web UI_ONLY
- Feature: [F024-01 Browse by source: All files, Uploads, Generated files, Artifacts](../../20-features/024-library-and-file-management-experience/F024-01-browse-by-source-all-files-uploads-generated-files.md)
- Competitor trace: CAP-files-and-attachments-18

## S24.05

**Image collection.** An Images view collects the user's images and opens each in a viewer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F024-02 Browse by media type: Images, Videos, Documents, Audio](../../20-features/024-library-and-file-management-experience/F024-02-browse-by-media-type-images-videos-documents-audio.md)
- Competitor trace: CAP-files-and-attachments-18

## S24.06

**Video collection.** A Videos view collects the user's videos and plays them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F024-02 Browse by media type: Images, Videos, Documents, Audio](../../20-features/024-library-and-file-management-experience/F024-02-browse-by-media-type-images-videos-documents-audio.md)
- Competitor trace: CAP-files-and-attachments-18

## S24.07

**Audio collection.** An Audio view collects the user's audio files.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F024-02 Browse by media type: Images, Videos, Documents, Audio](../../20-features/024-library-and-file-management-experience/F024-02-browse-by-media-type-images-videos-documents-audio.md)
- Competitor trace: CAP-files-and-attachments-09, CAP-files-and-attachments-18

## S24.08

**Recent-files view.** A recent-files view surfaces the files used or added most recently.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F024-03 Recent, favourite, shared and folder views](../../20-features/024-library-and-file-management-experience/F024-03-recent-favourite-shared-and-folder-views.md)
- Competitor trace: CAP-files-and-attachments-18

## S24.09

**Favorites.** Users can favorite files and view favorites.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F024-03 Recent, favourite, shared and folder views](../../20-features/024-library-and-file-management-experience/F024-03-recent-favourite-shared-and-folder-views.md)
- Competitor trace: CAP-files-and-attachments-19

## S24.10

**Shared-with-me view.** A Shared-with-me view lists files and items others shared with the user.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F024-03 Recent, favourite, shared and folder views](../../20-features/024-library-and-file-management-experience/F024-03-recent-favourite-shared-and-folder-views.md)

## S24.11

**Folder hierarchy.** Files can be organised in a folder hierarchy that can be browsed in the Library.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F024-03 Recent, favourite, shared and folder views](../../20-features/024-library-and-file-management-experience/F024-03-recent-favourite-shared-and-folder-views.md)
- Competitor trace: CAP-files-and-attachments-19

## S24.12

**Grid/list toggle.** Users can switch the Library between grid and list layouts.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F024-04 Search, sort and layout](../../20-features/024-library-and-file-management-experience/F024-04-search-sort-and-layout.md)
- Competitor trace: CAP-files-and-attachments-18

## S24.13

**Search.** Users can search the Library by name.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F024-04 Search, sort and layout](../../20-features/024-library-and-file-management-experience/F024-04-search-sort-and-layout.md)
- Competitor trace: CAP-files-and-attachments-18

## S24.14

**File-type filters.** Users can filter the Library by file type.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F024-02 Browse by media type: Images, Videos, Documents, Audio](../../20-features/024-library-and-file-management-experience/F024-02-browse-by-media-type-images-videos-documents-audio.md)
- Competitor trace: CAP-files-and-attachments-18

## S24.15

**Source-provider filters.** Users can filter the Library by where files came from (upload, generated, connector/provider).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F024-05 Filter by origin, owner, project or date](../../20-features/024-library-and-file-management-experience/F024-05-filter-by-origin-owner-project-or-date.md)
- Competitor trace: CAP-files-and-attachments-18

## S24.16

**Owner filters.** Users can filter the Library by owner.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F024-05 Filter by origin, owner, project or date](../../20-features/024-library-and-file-management-experience/F024-05-filter-by-origin-owner-project-or-date.md)
- Competitor trace: CAP-files-and-attachments-19

## S24.17

**Project filters.** Users can filter the Library by project.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F024-05 Filter by origin, owner, project or date](../../20-features/024-library-and-file-management-experience/F024-05-filter-by-origin-owner-project-or-date.md)
- Competitor trace: CAP-files-and-attachments-19

## S24.18

**Created/modified date filters.** Users can filter the Library by created/modified date.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F024-05 Filter by origin, owner, project or date](../../20-features/024-library-and-file-management-experience/F024-05-filter-by-origin-owner-project-or-date.md)
- Competitor trace: CAP-files-and-attachments-19

## S24.19

**Sort by name, date, size, or type.** Users can sort the Library by name, date, size or type.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web PARTIAL
- Feature: [F024-04 Search, sort and layout](../../20-features/024-library-and-file-management-experience/F024-04-search-sort-and-layout.md)
- Competitor trace: CAP-files-and-attachments-18

## S24.20

**Multi-selection.** Users can select several Library items at once.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F024-06 Select and act on several files](../../20-features/024-library-and-file-management-experience/F024-06-select-and-act-on-several-files.md)
- Competitor trace: CAP-files-and-attachments-19

## S24.21

**Batch download.** Users can download several selected files at once.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F024-06 Select and act on several files](../../20-features/024-library-and-file-management-experience/F024-06-select-and-act-on-several-files.md)
- Competitor trace: CAP-files-and-attachments-19

## S24.22

**Batch move.** Users can move several selected files at once.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F024-06 Select and act on several files](../../20-features/024-library-and-file-management-experience/F024-06-select-and-act-on-several-files.md)
- Competitor trace: CAP-files-and-attachments-19

## S24.23

**Batch delete.** Users can delete several selected files at once.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F024-06 Select and act on several files](../../20-features/024-library-and-file-management-experience/F024-06-select-and-act-on-several-files.md)
- Competitor trace: CAP-files-and-attachments-19

## S24.24

**Rename.** Users can rename a Library file.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F024-07 Rename, duplicate and move a file](../../20-features/024-library-and-file-management-experience/F024-07-rename-duplicate-and-move-a-file.md)
- Competitor trace: CAP-files-and-attachments-19

## S24.25

**Duplicate.** Users can duplicate a Library file.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F024-07 Rename, duplicate and move a file](../../20-features/024-library-and-file-management-experience/F024-07-rename-duplicate-and-move-a-file.md)
- Competitor trace: CAP-files-and-attachments-19

## S24.26

**Move to folder.** Users can move a file into a folder.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F024-07 Rename, duplicate and move a file](../../20-features/024-library-and-file-management-experience/F024-07-rename-duplicate-and-move-a-file.md)
- Competitor trace: CAP-files-and-attachments-19

## S24.27

**Add to Project.** Users can add a Library file to a project.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F024-08 Use a file in a chat or a project](../../20-features/024-library-and-file-management-experience/F024-08-use-a-file-in-a-chat-or-a-project.md)
- Competitor trace: CAP-files-and-attachments-17

## S24.28

**Attach to conversation.** Users can attach a Library file to a conversation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web PARTIAL
- Feature: [F024-08 Use a file in a chat or a project](../../20-features/024-library-and-file-management-experience/F024-08-use-a-file-in-a-chat-or-a-project.md)
- Competitor trace: CAP-files-and-attachments-18

## S24.29

**Open originating conversation.** From a Library file, users can open the conversation it came from.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F024-08 Use a file in a chat or a project](../../20-features/024-library-and-file-management-experience/F024-08-use-a-file-in-a-chat-or-a-project.md)

## S24.30

**Open external original.** Users can open the external original of a file (e.g. in Drive or its source site).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F024-10 File details, version history and the original source](../../20-features/024-library-and-file-management-experience/F024-10-file-details-version-history-and-the-original-sour.md)

## S24.31

**File-details panel.** A details panel shows a file's metadata (size, type, dates, source, where used).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F024-10 File details, version history and the original source](../../20-features/024-library-and-file-management-experience/F024-10-file-details-version-history-and-the-original-sour.md)

## S24.32

**Version history.** Users can see and restore earlier versions of a file.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F024-10 File details, version history and the original source](../../20-features/024-library-and-file-management-experience/F024-10-file-details-version-history-and-the-original-sour.md)

## S24.33

**Storage-consumption display.** The product shows how much storage the user's files consume against their allowance.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F024-11 Storage use and file status](../../20-features/024-library-and-file-management-experience/F024-11-storage-use-and-file-status.md)
- Competitor trace: CAP-files-and-attachments-20

## S24.34

**Trash and restore.** Deleted files go to a trash from which they can be restored.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F024-09 Recently deleted and restore](../../20-features/024-library-and-file-management-experience/F024-09-recently-deleted-and-restore.md)
- Competitor trace: CAP-files-and-attachments-21

## S24.35

**Expired-resource display.** Expired or no-longer-available files are clearly marked in the Library.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F024-11 Storage use and file status](../../20-features/024-library-and-file-management-experience/F024-11-storage-use-and-file-status.md)

## S24.36

**Processing-status display.** The Library shows a file's processing status (uploading, processing, ready, failed).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F024-11 Storage use and file status](../../20-features/024-library-and-file-management-experience/F024-11-storage-use-and-file-status.md)

## S24.37

**Connected-file browsing.** Users can browse files in connected storage (Drive, OneDrive, Dropbox) from the product.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F024-12 Connected storage and external files](../../20-features/024-library-and-file-management-experience/F024-12-connected-storage-and-external-files.md)
- Competitor trace: CAP-files-and-attachments-22

## S24.38

**Refresh external metadata.** Users can refresh metadata of externally linked files.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F024-12 Connected storage and external files](../../20-features/024-library-and-file-management-experience/F024-12-connected-storage-and-external-files.md)
- Competitor trace: CAP-files-and-attachments-22

## S24.39

**Save external content as a copy.** Users can save external content as an owned copy in the Library.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F024-12 Connected storage and external files](../../20-features/024-library-and-file-management-experience/F024-12-connected-storage-and-external-files.md)
- Competitor trace: CAP-files-and-attachments-22

## S24.40

**Distinguish external references from owned files.** The Library visibly distinguishes external references from files the user owns.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F024-12 Connected storage and external files](../../20-features/024-library-and-file-management-experience/F024-12-connected-storage-and-external-files.md)
- Competitor trace: CAP-files-and-attachments-22
