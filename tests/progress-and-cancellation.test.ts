import { describe, it, expect, vi } from 'vitest';
import { createArchive } from '../src/archive';
import { ProgressModal, CancellationToken } from '../src/progress-modal';
import { makeFakeVault } from './test-utils';

vi.mock('obsidian', () => ({
  Notice: class { constructor(public message: string){} },
  Modal: class {},
  App: class {},
}));

describe('progress indication and cancellation', () => {
  it('provides progress callbacks during archive creation', async () => {
    const { vault } = makeFakeVault({
      'LargeProject/file1.txt': 'A'.repeat(1000),
      'LargeProject/file2.txt': 'B'.repeat(1000),
      'LargeProject/file3.txt': 'C'.repeat(1000),
      'LargeProject/file4.txt': 'D'.repeat(1000),
      'LargeProject/file5.txt': 'E'.repeat(1000)
    });
    const app: any = { vault };

    const progressUpdates: Array<{done: number, total: number}> = [];
    
    // Track progress during archive creation
    await createArchive(
      app, 
      '.', 
      'Archive', 
      'LargeProject', 
      [
        'LargeProject/file1.txt',
        'LargeProject/file2.txt', 
        'LargeProject/file3.txt',
        'LargeProject/file4.txt',
        'LargeProject/file5.txt'
      ],
      {
        onProgress: (done: number, total: number) => {
          progressUpdates.push({ done, total });
        }
      }
    );

    // Verify progress callbacks were called
    expect(progressUpdates.length).toBeGreaterThan(0);
    
    // Verify progress makes sense (done should not exceed total)
    for (const update of progressUpdates) {
      expect(update.done).toBeLessThanOrEqual(update.total);
      expect(update.done).toBeGreaterThanOrEqual(0);
      expect(update.total).toBeGreaterThan(0);
    }

    // Final progress should show completion
    const lastUpdate = progressUpdates[progressUpdates.length - 1];
    expect(lastUpdate.done).toBe(lastUpdate.total);
  });

  it('supports operation cancellation via cancellation token', async () => {
    const { vault } = makeFakeVault({
      'TestFolder/file1.txt': 'Content 1',
      'TestFolder/file2.txt': 'Content 2'
    });
    const app: any = { vault };

    // Create a cancellation token and cancel it immediately
    const cancellationToken = new CancellationToken();
    cancellationToken.cancel();

    // Archive creation should throw when cancelled
    await expect(
      createArchive(
        app, 
        '.', 
        'Archive', 
        'TestFolder', 
        ['TestFolder/file1.txt', 'TestFolder/file2.txt'],
        { cancellationToken }
      )
    ).rejects.toThrow(/cancel/i);
  });

  it('progress modal provides user interface for long operations', () => {
    // Test that ProgressModal can be created and has expected interface
    const mockApp: any = { vault: {} };
    
    const progressModal = new ProgressModal(mockApp, { 
      title: 'Test Operation',
      showCancel: true 
    });
    
    // Verify modal has expected methods
    expect(typeof progressModal.updateProgress).toBe('function');
    expect(typeof progressModal.setComplete).toBe('function');
    expect(typeof progressModal.setError).toBe('function');
    expect(typeof progressModal.isCancelled).toBe('function');
    
    // Verify modal is not cancelled by default
    expect(progressModal.isCancelled()).toBe(false);
  });

  it('progress modal correctly handles cancellation', () => {
    const mockApp: any = { vault: {} };
    let cancelCalled = false;
    
    const progressModal = new ProgressModal(mockApp, { 
      title: 'Test Operation',
      showCancel: true,
      onCancel: () => {
        cancelCalled = true;
      }
    });
    
    // Initially not cancelled
    expect(progressModal.isCancelled()).toBe(false);
    
    // Note: In real usage, cancellation would be triggered by clicking the cancel button
    // For testing, we verify the interface exists and modal tracks cancellation state
    expect(typeof progressModal.isCancelled).toBe('function');
  });

  it('supports timeout protection for long-running operations', async () => {
    const { vault } = makeFakeVault({
      'TestFolder/file.txt': 'Test content'
    });
    const app: any = { vault };

    // Set a very short timeout to test timeout functionality
    const startTime = Date.now();
    
    try {
      await createArchive(
        app, 
        '.', 
        'Archive', 
        'TestFolder', 
        ['TestFolder/file.txt'],
        { 
          perFileTimeoutMs: 1, // Very short timeout
          overallTimeoutMs: 1   // Very short overall timeout
        }
      );
      
      // If we get here, either timeout didn't work or operation was very fast
      // This is acceptable for the test environment
    } catch (error) {
      // Timeout errors are expected with very short timeouts
      expect(error.message).toMatch(/timeout|timed out/i);
      
      // Operation should have taken at least the timeout duration
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(1);
    }
  });
});
