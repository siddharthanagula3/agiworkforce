import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import {
  browseConnectorListings,
  fetchConnectorDirectory,
  type ConnectedConnector,
  type ConnectorListing,
} from '@/services/connectors';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import {
  fetchInstalledSkillNames,
  fetchSkillCatalog,
  type ManagedSkillSummary,
} from '@/src/features/skills/service';

import { workCategoriesFrom, type DiscoverSources } from './discoverSuggestions';

export type DiscoverStatus = 'loading' | 'ready' | 'failed';

const NO_SKILLS_INSTALLED: ReadonlySet<string> = new Set();

interface ConnectorSuggestions {
  listings: ConnectorListing[];
  connections: ConnectedConnector[];
  workCategories: string[];
}

interface SkillSuggestions {
  skills: ManagedSkillSummary[];
  installed: ReadonlySet<string>;
}

async function loadConnectorSuggestions(): Promise<ConnectorSuggestions> {
  const [page, directory] = await Promise.all([
    browseConnectorListings({}),
    fetchConnectorDirectory(),
  ]);
  return {
    listings: page.entries,
    connections: directory.connectors,
    workCategories: workCategoriesFrom(page.categories),
  };
}

async function loadSkillSuggestions(): Promise<SkillSuggestions> {
  const [skills, installed] = await Promise.all([fetchSkillCatalog(), fetchInstalledSkillNames()]);
  return { skills, installed };
}

export function useDiscoverSuggestions({
  connectors,
  skills,
  ownerId,
}: {
  connectors: boolean;
  skills: boolean;
  ownerId: string | null;
}) {
  const [sources, setSources] = useState<DiscoverSources | null>(null);
  const [status, setStatus] = useState<DiscoverStatus>('loading');
  const requestRef = useRef(0);
  const loadedRef = useRef(false);
  const enabled = (connectors || skills) && ownerId !== null;

  const load = useCallback(async () => {
    const account = captureCloudAccountEpoch();
    if (!account) return;
    requestRef.current += 1;
    const request = requestRef.current;
    const isCurrent = () => request === requestRef.current && isCloudAccountEpochCurrent(account);
    const quiet = loadedRef.current;
    if (!quiet) setStatus('loading');
    const [connectorResult, skillResult] = await Promise.allSettled([
      connectors ? loadConnectorSuggestions() : Promise.resolve(null),
      skills ? loadSkillSuggestions() : Promise.resolve(null),
    ]);
    if (!isCurrent()) return;
    const failed = connectorResult.status === 'rejected' || skillResult.status === 'rejected';
    const allFailed =
      (!connectors || connectorResult.status === 'rejected') &&
      (!skills || skillResult.status === 'rejected');
    if (quiet && failed) return;
    if (allFailed) {
      setStatus('failed');
      return;
    }
    const connectorData = connectorResult.status === 'fulfilled' ? connectorResult.value : null;
    const skillData = skillResult.status === 'fulfilled' ? skillResult.value : null;
    loadedRef.current = true;
    setSources({
      listings: connectorData?.listings ?? null,
      connections: connectorData?.connections ?? null,
      workCategories: connectorData?.workCategories ?? [],
      skills: skillData?.skills ?? null,
      installed: skillData?.installed ?? NO_SKILLS_INSTALLED,
    });
    setStatus('ready');
  }, [connectors, skills]);

  useEffect(() => {
    requestRef.current += 1;
    loadedRef.current = false;
    setSources(null);
    setStatus('loading');
  }, [enabled, ownerId]);

  useFocusEffect(
    useCallback(() => {
      if (enabled && ownerId) void load();
      return () => {
        requestRef.current += 1;
      };
    }, [enabled, load, ownerId]),
  );

  const applyInstalled = useCallback((installed: ReadonlySet<string>) => {
    setSources((current) => (current ? { ...current, installed } : current));
  }, []);

  return { sources, status, retry: load, applyInstalled };
}
