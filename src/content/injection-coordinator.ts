import { ProviderId } from '../core/models/conversation.ts';
import { HandoffPayload } from '../core/models/handoff.ts';
import { AdapterRegistry } from '../adapters/registry.ts';
import { Logger } from '../shared/logger.ts';

const INJECTION_BANNER_ID = 'phero-injection-banner-host';

export class InjectionCoordinator {
  public static async checkAndPerformInjection(destinationProvider: ProviderId): Promise<void> {
    try {
      Logger.info('Checking for pending handoff', { destination: destinationProvider });

      const response = await chrome.runtime.sendMessage({
        type: 'PHERO_GET_PENDING_HANDOFF',
        destinationProvider,
      });

      const handoff: HandoffPayload | null = response?.handoff || null;

      if (!handoff) {
        Logger.info('No pending handoff found for this tab');
        return;
      }

      Logger.info('Found pending handoff, starting injection pipeline', {
        handoffId: handoff.handoffId,
      });

      this.showStatusBanner('Preparing Claude…', 'loading');

      const registry = AdapterRegistry.getInstance();
      const adapter = registry.getAdapter(destinationProvider);

      if (!adapter) {
        throw new Error(`No adapter found for destination: ${destinationProvider}`);
      }

      // Execute injection
      const result = await adapter.injectPrompt(document, handoff.continuationPrompt);

      if (result.success && result.verified) {
        Logger.info('Injection successfully completed and verified');
        this.showStatusBanner('Conversation ready · Review & Send', 'success');

        // Clear handoff from ephemeral storage
        await chrome.runtime.sendMessage({
          type: 'PHERO_CLEAR_HANDOFF',
          handoffId: handoff.handoffId,
        });

        // Hide banner after 3 seconds
        setTimeout(() => {
          this.removeBanner();
        }, 3500);
      } else {
        Logger.warn('Injection failed verification, presenting fallback copy', {
          error: result.error ?? 'Unknown error',
        });
        this.showFallbackBanner(handoff);
      }
    } catch (err) {
      Logger.error('Error during injection coordination', err);
    }
  }

  private static showStatusBanner(text: string, type: 'loading' | 'success'): void {
    this.removeBanner();

    const host = document.createElement('div');
    host.id = INJECTION_BANNER_ID;
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });
    const bg = type === 'success' ? '#064E3B' : '#18181B';
    const border = type === 'success' ? '#059669' : '#3F3F46';
    const color = type === 'success' ? '#A7F3D0' : '#E4E4E7';

    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
          position: fixed;
          top: 1rem;
          right: 1.5rem;
          z-index: 2147483647;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .banner {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.85rem;
          background: ${bg};
          border: 1px solid ${border};
          color: ${color};
          border-radius: 9999px;
          font-size: 12px;
          font-weight: 500;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
          transition: all 0.2s ease;
        }
      </style>
      <div class="banner">
        <span>${type === 'success' ? '✓' : '✦'}</span>
        <span>${text}</span>
      </div>
    `;
  }

  private static showFallbackBanner(handoff: HandoffPayload): void {
    this.removeBanner();

    const host = document.createElement('div');
    host.id = INJECTION_BANNER_ID;
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });

    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
          position: fixed;
          top: 1rem;
          right: 1.5rem;
          z-index: 2147483647;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .modal {
          width: 320px;
          padding: 0.85rem;
          background: #09090B;
          border: 1px solid #7F1D1D;
          color: #F4F4F5;
          border-radius: 0.75rem;
          font-size: 12px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
        }
        .title {
          font-weight: 600;
          color: #FDA4AF;
          margin-bottom: 0.25rem;
        }
        .desc {
          color: #A1A1AA;
          font-size: 11px;
          line-height: 1.4;
          margin-bottom: 0.75rem;
        }
        .actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
        }
        button {
          padding: 0.35rem 0.65rem;
          border-radius: 0.375rem;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid transparent;
        }
        .btn-dismiss {
          background: transparent;
          color: #71717A;
        }
        .btn-copy {
          background: #27272A;
          color: #F4F4F5;
          border-color: #3F3F46;
        }
        .btn-retry {
          background: #2563EB;
          color: white;
        }
      </style>
      <div class="modal">
        <div class="title">Automatic Placement Incomplete</div>
        <div class="desc">PHERO prepared the context but couldn't place it into Claude's editor. You can copy the continuation prompt below.</div>
        <div class="actions">
          <button class="btn-dismiss" id="btn-dismiss">Dismiss</button>
          <button class="btn-retry" id="btn-retry">Retry</button>
          <button class="btn-copy" id="btn-copy">Copy continuation</button>
        </div>
      </div>
    `;

    shadow.getElementById('btn-dismiss')?.addEventListener('click', () => {
      this.removeBanner();
    });

    shadow.getElementById('btn-retry')?.addEventListener('click', () => {
      this.checkAndPerformInjection(handoff.destinationProvider);
    });

    shadow.getElementById('btn-copy')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(handoff.continuationPrompt);
        const btn = shadow.getElementById('btn-copy');
        if (btn) btn.textContent = 'Copied!';
        setTimeout(() => this.removeBanner(), 1500);
      } catch (err) {
        Logger.error('Failed to copy prompt', err);
      }
    });
  }

  private static removeBanner(): void {
    const existing = document.getElementById(INJECTION_BANNER_ID);
    if (existing) {
      existing.remove();
    }
  }
}
