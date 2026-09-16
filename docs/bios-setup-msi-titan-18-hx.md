# BIOS setup for an OS install: MSI Titan 18 HX AI (MS-1824)

Machine: **Titan 18 HX AI A2XWJG**, board **MS-1824**, Intel Core Ultra 9
285HX (Arrow Lake-HX), RTX 5090 24GB, two NVMe SSDs (Gen5 + Gen4), Killer
WiFi 7 BE1750, ships with Windows 11 Pro.

This is the BIOS-side procedure for installing an OS from USB on this
laptop, plus the BIOS/EC firmware update procedure. Sections marked
**one-way door** change something that is painful or impossible to undo
after the OS is installed: read those before you touch the setting.

Keys: **Del** at the MSI logo enters BIOS. **F11** at the MSI logo gives a
one-time boot menu. Keep the AC adapter connected for everything below.

---

## 0. Before you change a single setting

1. **Save the BitLocker recovery key.** Windows 11 Pro on this machine very
   likely has BitLocker or Device Encryption on. Changing Secure Boot, TPM,
   or VMD alters the TPM measurements that seal the key, and the next
   Windows boot will demand the 48-digit recovery key. In Windows:
   `manage-bde -protectors -get C:` to read it, or suspend protection with
   `manage-bde -protectors -disable C: -rebootcount 2`. This is the single
   most common way people lock themselves out of this exact procedure.

2. **Decide whether the existing Windows install survives.** If you are
   wiping the machine, ignore step 1 but confirm nothing on either NVMe is
   the only copy. There are two drives; both are visible to the installer
   and both are easy to erase by accident.

3. **Photograph the four BIOS pages** (Main, Advanced, Boot, Security)
   before editing, so you can restore the as-found state. The as-found
   state for this machine is recorded at the bottom of this page.

---

## 1. Fix the clock

Main → **System Date** / **System Time**. As found, this machine's RTC read
`Thu 09/17/2026 03:11` when the actual local date was 09/16/2026, so it is
running ahead.

Set it correctly before installing anything. A wrong RTC breaks TLS
certificate validation during any network install, breaks package
repository signature checks on Linux, and can break Windows activation. It
is thirty seconds of work that prevents an hour of misdiagnosis.

---

## 2. Why the USB stick is not booting

The Boot page as found reads:

```
Boot Option #1   [USB CD/DVD]
Boot Option #2   [Hard Disk: Windows Boot Ma...]
Boot Option #3   [USB Hard Disk: UEFI: Gener...]
```

The stick is already plugged in and already detected: that is what
`USB Hard Disk: UEFI: Gener...` is. But a USB flash drive enumerates as a
**USB Hard Disk**, never as **USB CD/DVD**, so option #1 matches nothing,
and the machine falls through to option #2 and boots Windows.

Fix it one of two ways:

- **One-off (preferred):** press **F11** at the MSI logo and pick the USB
  entry directly. Nothing in the saved boot order changes.
- **Persistent:** on the Boot page, set **Boot Option #1** to
  `USB Hard Disk`. If several USB devices are attached, order them under
  **UEFI USB Hard Disk Drive BBS Priorities**.

Also set **Boot → Fast Boot** to `Disabled` for the duration of the
install. MSI Fast Boot skips USB and network device initialisation at POST,
which is exactly how a correctly written stick ends up invisible, and it
also shortens the window in which **Del** is accepted. Turn it back on
afterwards if you want the faster boot.

Leave **Boot mode select** at `UEFI`. There is no reason to use CSM/legacy
on this platform and Windows 11 will not install that way.

---

## 3. VMD: the decision that has to be made first (one-way door)

Advanced → **Enable VMD controller**, as found `[Enabled]`.

Intel Volume Management Device puts both NVMe drives behind a single PCIe
controller instead of exposing them as ordinary NVMe devices. An OS only
sees the drives if it has a driver for that controller.

**The one-way door:** if you install an OS with VMD enabled and later
disable it (or the reverse), the installed OS loses its boot device.
Windows gives `INACCESSIBLE_BOOT_DEVICE`. Decide once, before you install
anything, and do not touch it again.

### Installing Windows

Both options work. Pick one:

- **Leave VMD enabled.** At "Where do you want to install Windows" you will
  get *no drives found*. Click **Load driver**, browse to the Intel RST
  (IRST) VMD driver you put on the install stick, select **Intel RST VMD
  Controller**, and the drives appear. Download the IRST package from the
  MSI support page for this model and unzip it onto the stick **before**
  you start, because you will have no network and no second USB port habit
  once you are in there.
- **Disable VMD.** The drives appear as plain NVMe devices and no driver
  load is needed. You lose Intel RST features (RAID, Optane-style
  acceleration), which on a two-drive laptop you almost certainly were not
  using.

### Installing Linux

Test first, decide second. Boot the live image with VMD still enabled and
run `lsblk`. If both NVMe drives are listed, leave VMD enabled. If nothing
is listed, disable VMD in BIOS and re-check.

Expect to need it disabled. The Arrow Lake-HX VMD controller (PCI ID
`8086:ad0b`) has a known probe failure in the kernel where the VMCONFIG
`BUS_RESTRICT_CFG` field reads back an unexpected value and the `vmd`
driver bails, leaving the drives invisible even though the driver exists.
Fixes were still moving through the linux-pci list during 2026, so whether
your ISO's kernel carries them depends on the ISO. `lsblk` answers it in
five seconds.

**Correction to widely repeated advice:** adding `modprobe.blacklist=vmd`
does **not** make the drives appear when VMD is enabled in BIOS. With VMD
on, the `vmd` driver is the only thing that exposes the child NVMe devices
to the kernel; blacklisting it guarantees the drives stay invisible. That
parameter is for the opposite situation (VMD disabled, or a suspected VMD
stability bug). If a guide tells you to blacklist `vmd` to fix "drive not
found", it has the causality backwards.

### If Windows is already installed and you need to flip VMD

Do not just flip it. In Windows, as administrator:

```
bcdedit /set {current} safeboot minimal
shutdown /r /t 0
```

Enter BIOS, change the VMD setting, boot into Safe Mode (Windows installs
the driver for the new storage path), then:

```
bcdedit /deletevalue {current} safeboot
shutdown /r /t 0
```

Suspend BitLocker first (section 0) or you will be asked for the recovery
key on the way through.

---

## 4. Secure Boot and the BIOS password (one-way door)

Security → **Secure Boot**. As found, **Administrator Password: Not
Installed** and **Password Check: [Setup]**.

**If the Secure Boot options are greyed out**, that is expected on MSI: you
must set **Administrator Password** first, and the Secure Boot controls
become editable afterwards.

**Keep the password once you set it.** Two reasons. First, clearing it can
re-lock the settings you just changed. Second, this machine is going to
hold credentials for real infrastructure, and an unprotected firmware
setup screen undoes most of what Secure Boot and TPM are there for.
`Password Check: Setup` means the password is only demanded when entering
BIOS, not at every boot, which is the right trade-off here. Set it to
`Always` only if you want a pre-boot prompt on every power-on.

**There is no self-service recovery for a forgotten MSI BIOS administrator
password.** It is a service-centre job. Put it in the team password manager
at the moment you set it, not later.

### Which way to set Secure Boot

- **Windows:** leave Secure Boot **enabled**. Windows 11 expects it, and
  disabling it buys you nothing.
- **Ubuntu / Fedora / other shim-signed distros:** Secure Boot can stay
  **enabled**. The installer works, but the proprietary NVIDIA driver for
  the RTX 5090 builds an unsigned kernel module, so you will go through MOK
  enrollment (a blue MOK Manager screen on the next reboot, with a password
  you set during driver install). Miss that screen and the GPU driver
  silently fails to load.
- **If you do not want to deal with MOK,** disable Secure Boot **before**
  installing, not after. Turning it back on later without having signed
  your modules leaves you at a black screen.

Also on this page: **Trusted Computing**. Leave TPM enabled. Windows 11
requires it, and it is what backs BitLocker and Windows Hello. Do not
"clear" the TPM unless you have the BitLocker recovery key in hand, because
clearing it destroys the sealed key.

---

## 5. Everything else on the Advanced page

Leave these alone unless a row says otherwise.

| Setting | As found | Do |
| --- | --- | --- |
| Intel Virtualization Technology | Enabled | **Keep.** Needed for WSL2, Hyper-V, Docker Desktop, KVM. |
| VT-d | Enabled | **Keep.** Needed for nested virtualisation, IOMMU, GPU passthrough, and Windows memory integrity. |
| Intel Speed Shift | Enabled | Keep. Hardware-managed frequency scaling, both OSes use it. |
| CPU C states | Enabled | Keep. Disabling it costs battery and gains nothing. |
| Network Stack | Disabled | Keep disabled unless you are doing a PXE network install. If you enable it for PXE, turn it back off afterwards: it is boot-time attack surface. |
| Allow BIOS Downgrade | Disabled | Keep disabled unless deliberately rolling back firmware (section 7). |
| ERP lot 3 support | Disabled | Keep disabled. Enabling it cuts standby power to the point that USB power share and wake-on-LAN stop working. |
| User Scenario | Balance Mode | Irrelevant to installing. It is a fan and power profile. |
| Onboard Lan Controller | Enabled | Keep. This is the 2.5GbE port, and it is your fallback if wireless has no driver during install. |
| ME firmware Windows Update | Enabled | Keep. |
| BACKSLASH/ALT Key Swap | Disabled | Keep, unless this is a keyboard layout the operator specifically wants swapped. |

---

## 6. Install media and per-OS notes

Write the stick as **GPT / UEFI**, FAT32 (or use Ventoy, which presents as
a USB Hard Disk and works fine here). Do not use any Rufus "bypass TPM /
Secure Boot" option: this machine has real TPM 2.0 and passes the checks
honestly.

**Windows 11:** put the MSI IRST driver for MS-1824 on the same stick
(section 3). Get chipset, Killer WiFi, and NVIDIA drivers from the MSI
support page for this model onto the stick too, because a fresh Windows
install may come up with no wireless.

**Linux:** use a 2026-era ISO. An older LTS image is a bad idea on this
hardware specifically:

- The Killer BE1750 wireless card is an Intel BE200-class part and needs a
  recent kernel plus current `iwlwifi` firmware. On an older kernel you get
  no wireless at all, which is survivable only because of the 2.5GbE port.
- The RTX 5090 (Blackwell) needs a very recent NVIDIA driver branch.
  Nouveau will not give you a usable desktop on it.
- The Arrow Lake-HX platform itself is better supported the newer the
  kernel, VMD included (section 3).

With two NVMe drives, install Linux to the **second** drive and leave
Windows intact on the first, rather than shrinking the Windows partition.
Pick the target by size and model in the installer, not by `nvme0n1` versus
`nvme1n1`, which can swap between boots.

---

## 7. Updating BIOS and EC firmware

This is the other thing "BIOS installation" can mean, and if you intend to
do it, **do it before installing the OS**, never after: a firmware update
can reset settings to defaults, and a VMD setting that silently flips back
leaves your freshly installed OS unbootable.

1. Download the BIOS/EC package for **MS-1824** from the MSI support page
   for this exact model. The wrong model's firmware bricks the board.
2. Unzip it to the root of a **FAT32** USB stick.
3. In BIOS, press **F9** to load optimised defaults first, and revert any
   undervolt or overclock.
4. **Keep the AC adapter connected.** Do not let it lose power.
5. Advanced → **UEFI BIOS Update** → select the USB device → select the
   matching firmware file → confirm.
6. The EC firmware update runs automatically after the BIOS update, and the
   machine reboots itself more than once. Do not interrupt it.
7. Re-apply every setting from this document afterwards, because defaults
   were loaded. **Check VMD first.**

**Allow BIOS Downgrade** is `Disabled` as found, so you cannot roll back to
an earlier version without enabling it first. Leave it disabled unless you
are deliberately downgrading, and understand that a downgrade is the higher
risk operation of the two.

---

## 8. Post-install checks

- Both NVMe drives visible to the OS (`lsblk`, or Disk Management).
- Secure Boot state matches intent: `Confirm-SecureBootUEFI` in PowerShell,
  or `mokutil --sb-state` on Linux.
- TPM present: `tpm.msc` in Windows, or `/dev/tpm0` on Linux.
- Virtualisation live: `systeminfo` Hyper-V line, or `kvm-ok`.
- GPU driver loaded: `nvidia-smi` on either OS.
- Wireless and 2.5GbE both up.
- Disk encryption re-enabled if you suspended it, and the recovery key
  stored in the team password manager.
- BIOS administrator password stored in the team password manager.

---

## As-found BIOS state (reference)

Captured 2026-09-16 from the four setup pages, before any changes.

**Main:** Marketing Name `Titan 18 HX AI A2XWJG`, Model Name `MS-1824`,
System Date `Thu 09/17/2026`, System Time `03:11:06`, System Language
`English`.

**Advanced:** Enable VMD controller `Enabled`, Intel Speed Shift
`Enabled`, ERP lot 3 support `Disabled`, BACKSLASH/ALT Key Swap
`Disabled`, Network Stack `Disabled`, Intel Virtualization Technology
`Enabled`, VT-d `Enabled`, CPU C states `Enabled`, Allow BIOS Downgrade
`Disabled`, User Scenario `Balance Mode`, Onboard Lan Controller
`Enabled`, ME firmware Windows Update `Enabled`, USB Power Share in
Hibernation `Enabled`, USB Power Share Mode `AC Only`.

**Boot:** Bootup NumLock `On`, Fast Boot `Enabled`, Boot mode select
`UEFI`, fixed order `USB CD/DVD` / `Hard Disk: Windows Boot Manager` /
`USB Hard Disk: UEFI: Gener...` / `Network` / `USB Lan`.

**Security:** Administrator Password `Not Installed`, User Password `Not
Installed`, Password Check `Setup`.
