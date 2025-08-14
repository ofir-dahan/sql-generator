// MobX configuration to prevent version conflicts
// This fixes "There are multiple, different versions of MobX active" error

if (typeof window !== 'undefined') {
  // Check if MobX is available globally (from devtools or other sources)
  const windowObj = window as unknown as Record<string, unknown>;
  const globalMobX = windowObj.mobx || windowObj.__mobxGlobals;
  
  if (globalMobX && typeof globalMobX === 'object' && globalMobX !== null && 'configure' in globalMobX) {
    try {
      const configure = (globalMobX as { configure: (config: Record<string, unknown>) => void }).configure;
      configure({ 
        isolateGlobalState: true,
        disableErrorBoundaries: true 
      });
    } catch {
      // Silently fail if already configured
      console.debug('MobX configuration already set or not available');
    }
  }
}

export {};
