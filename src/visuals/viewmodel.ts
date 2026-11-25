import { mat4 } from "wgpu-matrix";
import { approach, clamp, lerpN } from "../engine/math";
import { isGun } from "../gameplay/items";

export var GLOVE2 = [1, 1, 1];
export class Viewmodel {
  swayX = 0;
  swayY = 0;
  bobAmount = 0;
  cam = mat4.create();
  m = mat4.create();
  hand = mat4.create();
  update(realDt, mouseDx, mouseDy, planarSpeed, grounded) {
    this.swayX = approach(this.swayX, clamp(-mouseDx * 9e-4, -0.05, 0.05), 0.08, realDt);
    this.swayY = approach(this.swayY, clamp(mouseDy * 9e-4, -0.05, 0.05), 0.08, realDt);
    this.bobAmount = approach(this.bobAmount, grounded ? clamp(planarSpeed / 4, 0, 1) : 0, 0.1, realDt);
  }
  draw(renderer, meshes, eye, yaw, pitch, p, stride, reduceMotion) {
    const cam = this.cam;
    mat4.translation([eye[0], eye[1], eye[2]], cam);
    mat4.rotateY(cam, yaw, cam);
    mat4.rotateX(cam, pitch, cam);
    const bobScale = reduceMotion ? 0.3 : 1;
    const bobX = Math.sin(stride * 2.2) * 0.012 * this.bobAmount * bobScale;
    const bobY = -Math.abs(Math.cos(stride * 2.2)) * 0.012 * this.bobAmount * bobScale;
    const sx = this.swayX * bobScale + bobX;
    const sy = this.swayY * bobScale + bobY;
    const pickup = p.pickupAge < 0.2 ? 1 - p.pickupAge / 0.2 : 0;
    const throwT = p.throwAge < 0.3 ? p.throwAge / 0.3 : -1;
    const held = p.held;
    if (!held) {
      for (const side of [1, -1]) {
        const punching = p.punchSide === side && p.punchAge < 0.24;
        const t = punching ? p.punchAge / 0.24 : 0;
        const ext = punching ? Math.sin(t * Math.PI) : 0;
        const x = 0.2 * side + sx - ext * 0.12 * side;
        let y = -0.2 + sy + ext * 0.07;
        let z = -0.4 - ext * 0.32;
        if (throwT >= 0 && side === 1) {
          const k = Math.sin(throwT * Math.PI);
          z -= k * 0.25;
          y += k * 0.08;
        }
        y -= pickup * 0.15;
        this.drawArm(renderer, meshes, x, y, z, side, ext);
      }
      return;
    }
    const kind = held.kind;
    const recoilScale = kind === "scatter" ? 1.6 : kind === "carbine" ? 0.7 : 1;
    const recoil = Math.exp(-p.recoilAge * 14) * recoilScale;
    const hx = 0.19 + sx;
    let hy = -0.2 + sy - pickup * 0.2;
    let hz = -0.38 + recoil * 0.07;
    if (throwT >= 0) {
      const k = Math.sin(throwT * Math.PI);
      hz -= k * 0.25;
      hy += k * 0.1;
    }
    const hand = this.hand;
    mat4.translate(cam, [hx, hy, hz], hand);
    mat4.rotateX(hand, recoil * 0.22, hand);
    if (kind === "blade") {
      const slash = p.slashAge < 0.25 ? p.slashAge / 0.25 : -1;
      if (slash >= 0) {
        const k = Math.sin(slash * Math.PI);
        mat4.translate(hand, [-k * 0.25, k * 0.05, -k * 0.15], hand);
        mat4.rotateY(hand, 0.9 - slash * 1.8, hand);
        mat4.rotateZ(hand, -k * 0.9, hand);
      } else {
        mat4.rotateY(hand, 0.25, hand);
        mat4.rotateX(hand, 0.55, hand);
      }
    } else if (kind === "katana") {
      // Idle: held in right hand, upright across the POV pointing toward the top-left corner
      const idlePos = [0.05, -0.02, -0.02];
      const idleRot = [0.95, 0.3, 0.4]; // [rx, ry, rz]
      // Top-right wind-up apex
      const topPos = [0.12, 0.42, -0.02];
      const topRot = [1.05, -0.22, -0.35];
      // Bottom-right cut finish
      const botPos = [0.08, -0.14, -0.06];
      const botRot = [-0.78, -0.12, -0.16];

      const slash = p.slashAge < 0.25 ? p.slashAge / 0.25 : -1;
      let ox = idlePos[0], oy = idlePos[1], oz = idlePos[2];
      let rx = idleRot[0], ry = idleRot[1], rz = idleRot[2];
      if (slash >= 0) {
        const smooth = (u: number) => u * u * (3 - 2 * u);
        if (slash < 0.2) {
          const u = smooth(slash / 0.2);
          ox = lerpN(idlePos[0], topPos[0], u);
          oy = lerpN(idlePos[1], topPos[1], u);
          oz = lerpN(idlePos[2], topPos[2], u);
          rx = lerpN(idleRot[0], topRot[0], u);
          ry = lerpN(idleRot[1], topRot[1], u);
          rz = lerpN(idleRot[2], topRot[2], u);
        } else if (slash < 0.65) {
          const u = smooth((slash - 0.2) / 0.45);
          ox = lerpN(topPos[0], botPos[0], u);
          oy = lerpN(topPos[1], botPos[1], u);
          oz = lerpN(topPos[2], botPos[2], u) - Math.sin(u * Math.PI) * 0.14;
          rx = lerpN(topRot[0], botRot[0], u);
          ry = lerpN(topRot[1], botRot[1], u);
          rz = lerpN(topRot[2], botRot[2], u);
        } else {
          const u = smooth((slash - 0.65) / 0.35);
          ox = lerpN(botPos[0], idlePos[0], u);
          oy = lerpN(botPos[1], idlePos[1], u);
          oz = lerpN(botPos[2], idlePos[2], u);
          rx = lerpN(botRot[0], idleRot[0], u);
          ry = lerpN(botRot[1], idleRot[1], u);
          rz = lerpN(botRot[2], idleRot[2], u);
        }
      }
      mat4.translate(hand, [ox, oy, oz], hand);
      mat4.rotateZ(hand, rz, hand);
      mat4.rotateY(hand, ry, hand);
      mat4.rotateX(hand, rx, hand);
    }
    this.drawItem(renderer, meshes, kind, hand);
    this.drawFistAt(renderer, meshes, hand);
    this.drawArmFromHand(renderer, meshes, hand);
    if (kind === "scatter" || kind === "carbine") {
      mat4.translate(hand, [-0.03, -0.04, -0.3], this.m);
      this.drawFistAt(renderer, meshes, this.m);
    }
  }
  drawItem(renderer, meshes, kind, hand) {
    const m2 = this.m;
    switch (kind) {
      case "pistol":
        mat4.translate(hand, [0, 0.045, -0.03], m2);
        break;
      case "scatter":
        mat4.translate(hand, [0, 0.05, -0.12], m2);
        break;
      case "carbine":
        mat4.translate(hand, [0, 0.06, -0.08], m2);
        break;
      case "blade":
        mat4.translate(hand, [0, 0.02, -0.1], m2);
        break;
      case "katana":
        mat4.translate(hand, [0, 0.02, -0.14], m2);
        break;
      default:
        mat4.translate(hand, [0, 0.07, -0.04], m2);
    }
    renderer.drawMesh(meshes.items[kind], m2, [1, 1, 1], 0.08, "viewmodel");
  }
  drawArm(renderer, meshes, x, y, z, side, ext) {
    const m2 = this.hand;
    mat4.translate(this.cam, [x, y, z], m2);
    mat4.rotateY(m2, side * 0.12 - ext * 0.1 * side, m2);
    mat4.rotateX(m2, 0.15 + ext * 0.1, m2);
    this.drawFistAt(renderer, meshes, m2);
    this.drawArmFromHand(renderer, meshes, m2);
  }
  drawFistAt(renderer, meshes, m2) {
    renderer.drawMesh(meshes.fist, m2, GLOVE2, 0, "viewmodel");
  }
  drawArmFromHand(renderer, meshes, hand) {
    const fa = mat4.translate(hand, [0, -0.01, 0.04]);
    mat4.rotateX(fa, Math.PI / 2 - 0.15, fa);
    renderer.drawMesh(meshes.forearm, fa, GLOVE2, 0, "viewmodel");
  }
};

