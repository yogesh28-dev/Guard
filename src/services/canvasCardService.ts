import { createCanvas, loadImage } from '@napi-rs/canvas';

export interface CardOptions {
  username: string;
  discriminator?: string;
  avatarUrl?: string | null;
  guildName: string;
  memberCount: number;
  templateUrl?: string | null;
  customTheme?: string | null;
}

export class CanvasCardService {
  /**
   * Generates an 800x400 cyberpunk dark themed Welcome Card with optional dynamic template image
   */
  public static async generateWelcomeCard(options: CardOptions): Promise<Buffer> {
    const width = 800;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    let templateLoaded = false;
    if (options.templateUrl) {
      try {
        const bgImg = await loadImage(options.templateUrl);
        // Draw template image cover
        ctx.drawImage(bgImg, 0, 0, width, height);

        // Apply dark cyber overlay for readability
        ctx.fillStyle = 'rgba(10, 11, 16, 0.72)';
        ctx.fillRect(0, 0, width, height);
        templateLoaded = true;
      } catch {
        templateLoaded = false;
      }
    }

    if (!templateLoaded) {
      // 1. Dark Cyberpunk Default Gradient Background
      const bgGradient = ctx.createLinearGradient(0, 0, width, height);
      bgGradient.addColorStop(0, '#090a10');
      bgGradient.addColorStop(0.5, '#0e111a');
      bgGradient.addColorStop(1, '#06070a');
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, width, height);

      // 2. Cyberpunk Grid Overlay
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.05)';
      ctx.lineWidth = 1;
      const gridSize = 30;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }

    // 3. Cyber Neon Corner Accents & Card Border
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 15;
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, width - 40, height - 40);

    // Accent lines at corners
    ctx.strokeStyle = '#ff007f';
    ctx.lineWidth = 4;
    // Top-Left corner
    ctx.beginPath();
    ctx.moveTo(15, 60);
    ctx.lineTo(15, 15);
    ctx.lineTo(60, 15);
    ctx.stroke();

    // Bottom-Right corner
    ctx.beginPath();
    ctx.moveTo(width - 60, height - 15);
    ctx.lineTo(width - 15, height - 15);
    ctx.lineTo(width - 15, height - 60);
    ctx.stroke();
    ctx.restore();

    // 4. Header Bar with Guild Info
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(40, 35, width - 80, 30);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(`GUARD PROTOCOL // SYSTEM_JOIN // ${options.guildName.toUpperCase()}`, 55, 55);

    // 5. Circular Avatar
    const avatarX = 140;
    const avatarY = 220;
    const avatarRadius = 75;

    // Outer Glowing Ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius + 6, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 20;
    ctx.stroke();

    // Secondary Magenta Ring
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius + 12, -Math.PI / 4, Math.PI / 2);
    ctx.strokeStyle = '#ff007f';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#ff007f';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.restore();

    // Clip & Draw Avatar
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    let avatarLoaded = false;
    if (options.avatarUrl) {
      try {
        const avatarImage = await loadImage(options.avatarUrl);
        ctx.drawImage(
          avatarImage,
          avatarX - avatarRadius,
          avatarY - avatarRadius,
          avatarRadius * 2,
          avatarRadius * 2
        );
        avatarLoaded = true;
      } catch {
        avatarLoaded = false;
      }
    }

    if (!avatarLoaded) {
      ctx.fillStyle = '#1b1d2e';
      ctx.fillRect(
        avatarX - avatarRadius,
        avatarY - avatarRadius,
        avatarRadius * 2,
        avatarRadius * 2
      );
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 50px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(options.username.charAt(0).toUpperCase(), avatarX, avatarY);
    }
    ctx.restore();

    // 6. Typography & Text Elements
    ctx.textAlign = 'left';

    ctx.fillStyle = '#ff007f';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('IDENTIFICATION VERIFIED', 260, 150);

    // "WELCOME" Main Typography
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 52px sans-serif';
    ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
    ctx.shadowBlur = 18;
    ctx.fillText('WELCOME', 260, 205);
    ctx.restore();

    // Username / Tag
    ctx.fillStyle = '#e0e6ed';
    ctx.font = 'bold 24px sans-serif';
    const tag = options.discriminator && options.discriminator !== '0'
      ? `${options.username}#${options.discriminator}`
      : `@${options.username}`;
    ctx.fillText(tag.length > 25 ? tag.substring(0, 22) + '...' : tag, 260, 245);

    // Member Count Badge
    const badgeX = 260;
    const badgeY = 270;
    const badgeW = 220;
    const badgeH = 34;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(`MEMBER #${options.memberCount.toLocaleString()}`, badgeX + 16, badgeY + 22);

    // Bottom Decorative Bar
    ctx.fillStyle = 'rgba(255, 0, 127, 0.6)';
    ctx.fillRect(40, height - 35, 120, 3);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillRect(170, height - 35, width - 210, 3);

    return canvas.toBuffer('image/png');
  }

  /**
   * Generates an 800x400 twilight themed Goodbye Card with optional dynamic template image
   */
  public static async generateGoodbyeCard(options: CardOptions): Promise<Buffer> {
    const width = 800;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    let templateLoaded = false;
    if (options.templateUrl) {
      try {
        const bgImg = await loadImage(options.templateUrl);
        ctx.drawImage(bgImg, 0, 0, width, height);

        // Apply dark twilight overlay for readability
        ctx.fillStyle = 'rgba(16, 8, 26, 0.75)';
        ctx.fillRect(0, 0, width, height);
        templateLoaded = true;
      } catch {
        templateLoaded = false;
      }
    }

    if (!templateLoaded) {
      // 1. Twilight Gradient Background
      const bgGradient = ctx.createLinearGradient(0, 0, width, height);
      bgGradient.addColorStop(0, '#0c0714');
      bgGradient.addColorStop(0.4, '#1b0d2b');
      bgGradient.addColorStop(0.8, '#260f38');
      bgGradient.addColorStop(1, '#0e0517');
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, width, height);

      // 2. Twilight Stars / Particles
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      const stars = [
        [60, 80], [120, 50], [200, 95], [310, 45], [450, 70],
        [580, 55], [680, 90], [740, 40], [150, 330], [670, 320],
        [710, 270], [380, 340], [520, 350], [90, 290]
      ];
      for (const [sx, sy] of stars) {
        ctx.beginPath();
        ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // 3. Twilight Horizon Glow
      const horizonGlow = ctx.createRadialGradient(width / 2, height, 50, width / 2, height, 400);
      horizonGlow.addColorStop(0, 'rgba(224, 86, 136, 0.25)');
      horizonGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = horizonGlow;
      ctx.fillRect(0, 0, width, height);
    }

    // 4. Subtle Border
    ctx.save();
    ctx.strokeStyle = 'rgba(224, 86, 136, 0.5)';
    ctx.shadowColor = 'rgba(224, 86, 136, 0.4)';
    ctx.shadowBlur = 15;
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, width - 40, height - 40);
    ctx.restore();

    // 5. Header Bar
    ctx.fillStyle = 'rgba(224, 86, 136, 0.15)';
    ctx.fillRect(40, 35, width - 80, 30);
    ctx.fillStyle = '#ff7b90';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(`GUARD PROTOCOL // SYSTEM_DEPARTURE // ${options.guildName.toUpperCase()}`, 55, 55);

    // 6. Circular Avatar
    const avatarX = 140;
    const avatarY = 220;
    const avatarRadius = 75;

    // Glowing Twilight Ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius + 6, 0, Math.PI * 2);
    ctx.strokeStyle = '#e05688';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#e05688';
    ctx.shadowBlur = 20;
    ctx.stroke();

    // Inner subtle ring
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius + 11, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(155, 93, 229, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Clip & Draw Avatar
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    let avatarLoaded = false;
    if (options.avatarUrl) {
      try {
        const avatarImage = await loadImage(options.avatarUrl);
        ctx.drawImage(
          avatarImage,
          avatarX - avatarRadius,
          avatarY - avatarRadius,
          avatarRadius * 2,
          avatarRadius * 2
        );
        avatarLoaded = true;
      } catch {
        avatarLoaded = false;
      }
    }

    if (!avatarLoaded) {
      ctx.fillStyle = '#221133';
      ctx.fillRect(
        avatarX - avatarRadius,
        avatarY - avatarRadius,
        avatarRadius * 2,
        avatarRadius * 2
      );
      ctx.fillStyle = '#ff7b90';
      ctx.font = 'bold 50px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(options.username.charAt(0).toUpperCase(), avatarX, avatarY);
    }
    ctx.restore();

    // 7. Typography
    ctx.textAlign = 'left';

    ctx.fillStyle = '#c77dff';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('CONNECTION TERMINATED', 260, 150);

    // "GOOD BYE" Typography
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 52px sans-serif';
    ctx.shadowColor = 'rgba(224, 86, 136, 0.8)';
    ctx.shadowBlur = 18;
    ctx.fillText('GOOD BYE', 260, 205);
    ctx.restore();

    // Username / Tag
    ctx.fillStyle = '#e2cfea';
    ctx.font = 'bold 24px sans-serif';
    const tag = options.discriminator && options.discriminator !== '0'
      ? `${options.username}#${options.discriminator}`
      : `@${options.username}`;
    ctx.fillText(tag.length > 25 ? tag.substring(0, 22) + '...' : tag, 260, 245);

    // Remaining Members Badge
    const badgeX = 260;
    const badgeY = 270;
    const badgeW = 250;
    const badgeH = 34;

    ctx.fillStyle = 'rgba(155, 93, 229, 0.2)';
    ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
    ctx.strokeStyle = '#9b5de5';
    ctx.lineWidth = 1;
    ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);

    ctx.fillStyle = '#e0aaff';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(`MEMBERS REMAINING: ${options.memberCount.toLocaleString()}`, badgeX + 16, badgeY + 22);

    // Bottom Decorative Bar
    ctx.fillStyle = 'rgba(224, 86, 136, 0.6)';
    ctx.fillRect(40, height - 35, 140, 3);
    ctx.fillStyle = 'rgba(155, 93, 229, 0.6)';
    ctx.fillRect(190, height - 35, width - 230, 3);

    return canvas.toBuffer('image/png');
  }
}
