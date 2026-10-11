import { describe, it, expect } from 'vitest';
import { TargetProvisioningService } from '../src/services/targetProvisioningService';
import { CONFIG, isMasterOwner, isMasterGuild } from '../src/config';

describe('TargetProvisioningService & Voice Control Panel', () => {
  it('should generate an embed with exactly 20 moderation buttons across 4 rows', () => {
    const mockGuild = {
      name: 'Alpha Target Server',
      id: '123456789012345678',
    } as any;

    const panel = TargetProvisioningService.createVoiceControlPanel(mockGuild, CONFIG.MASTER_OWNER_ID);

    expect(panel.embeds.length).toBe(1);
    expect(panel.components.length).toBe(4);

    let totalButtons = 0;
    const buttonIds: string[] = [];

    for (const row of panel.components) {
      expect(row.components.length).toBe(5);
      for (const component of row.components) {
        totalButtons++;
        if ('data' in component && 'custom_id' in (component as any).data) {
          buttonIds.push((component as any).data.custom_id);
        }
      }
    }

    expect(totalButtons).toBe(20);
    expect(buttonIds).toContain('vc_mute_all');
    expect(buttonIds).toContain('vc_unmute_all');
    expect(buttonIds).toContain('vc_deafen_all');
    expect(buttonIds).toContain('vc_undeafen_all');
    expect(buttonIds).toContain('vc_disconnect_all');
    expect(buttonIds).toContain('vc_lock');
    expect(buttonIds).toContain('vc_unlock');
    expect(buttonIds).toContain('vc_kick_user');
    expect(buttonIds).toContain('vc_vdrag');
    expect(buttonIds).toContain('vc_limit');
    expect(buttonIds).toContain('vc_rename');
    expect(buttonIds).toContain('vc_bitrate');
    expect(buttonIds).toContain('vc_priority');
    expect(buttonIds).toContain('vc_toggle_stream');
    expect(buttonIds).toContain('vc_toggle_soundboard');
    expect(buttonIds).toContain('vc_mute_bot');
    expect(buttonIds).toContain('vc_purge_chat');
    expect(buttonIds).toContain('vc_security_alert');
    expect(buttonIds).toContain('vc_status_info');
    expect(buttonIds).toContain('vc_end_session');
  });

  it('should validate Master Owner and Master Guild identification', () => {
    expect(isMasterOwner('1519909192373112923')).toBe(true);
    expect(isMasterOwner('111111111111111111')).toBe(false);
    expect(isMasterGuild('1549116937567609035')).toBe(true);
    expect(isMasterGuild('111111111111111111')).toBe(false);
  });
});
