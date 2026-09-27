import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { exampleScenario } from '../domain';
import type { EnergyDocument } from '../types';
import { EnergyLensViewModel } from '../viewModel';
import type { EnergyRepository } from '../repository';

function makeRepository(): EnergyRepository & { data: EnergyDocument; save: ReturnType<typeof vi.fn> } {
  const data: EnergyDocument = { version: 1, scenarios: [structuredClone(exampleScenario)], activeScenarioId: exampleScenario.id };
  return { data, load: () => data, save: vi.fn((next: EnergyDocument) => { data.scenarios = next.scenarios; data.activeScenarioId = next.activeScenarioId; }) };
}

describe('EnergyLensViewModel', () => {
  let repository: ReturnType<typeof makeRepository>;
  let vm: EnergyLensViewModel;
  beforeEach(() => { repository = makeRepository(); vm = new EnergyLensViewModel(repository); vm.initialize(); });
  afterEach(() => vi.restoreAllMocks());

  it('initializes, persists edits, and recalculates results', () => {
    expect(vm.getState().status).toBe('ready');
    const before = vm.activeSummary?.total.monthlyKwh;
    vm.updateDevice('device-aircon', { dailyHours: 2 });
    expect(vm.activeSummary?.total.monthlyKwh).toBeLessThan(before ?? Infinity);
    expect(repository.save).toHaveBeenCalled();
  });

  it('keeps invalid values out of the document and exposes an error notice', () => {
    vm.updateDevice('device-aircon', { watts: -50 });
    expect(vm.getState().status).toBe('error');
    expect(vm.getState().notice?.text).toBe('功率不能为负数');
    expect(vm.activeScenario?.devices[0].watts).toBe(1200);
  });

  it('duplicates a scenario and can recover a saved document', () => {
    vm.duplicateActive();
    expect(vm.getState().document?.scenarios).toHaveLength(2);
    const recovered = new EnergyLensViewModel(repository);
    recovered.initialize();
    expect(recovered.getState().document?.scenarios).toHaveLength(2);
  });

  it('surfaces persistence failure as a recoverable error', () => {
    repository.save.mockImplementation(() => { throw new Error('quota'); });
    vm.addDevice();
    expect(vm.getState().status).toBe('error');
    expect(vm.getState().notice?.text).toContain('保存失败');
  });

  it('keeps devices added in the same millisecond independent from each other', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    vm.addDevice();
    vm.addDevice();
    const devices = vm.activeScenario?.devices ?? [];
    const ids = devices.map((device) => device.id);
    expect(new Set(ids).size).toBe(ids.length);
    const [first, second] = devices.slice(-2);
    vm.updateDevice(first.id, { watts: 500 });
    expect(vm.activeScenario?.devices.find((device) => device.id === first.id)?.watts).toBe(500);
    expect(vm.activeScenario?.devices.find((device) => device.id === second.id)?.watts).toBe(100);
    vm.removeDevice(first.id);
    expect(vm.activeScenario?.devices.some((device) => device.id === first.id)).toBe(false);
    expect(vm.activeScenario?.devices.some((device) => device.id === second.id)).toBe(true);
  });

  it('keeps scenarios duplicated in the same millisecond independent and switchable', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    vm.duplicateActive();
    const firstCopyId = vm.getState().document?.activeScenarioId ?? '';
    vm.duplicateActive();
    const secondCopyId = vm.getState().document?.activeScenarioId ?? '';
    expect(firstCopyId).not.toBe(secondCopyId);
    const scenarios = vm.getState().document?.scenarios ?? [];
    expect(scenarios).toHaveLength(3);
    expect(new Set(scenarios.map((scenario) => scenario.id)).size).toBe(3);

    // 当前活动的是第二份副本，改它的设备不能串到第一份副本
    const activeDeviceId = vm.activeScenario?.devices[0].id ?? '';
    vm.updateDevice(activeDeviceId, { watts: 333 });
    const after = vm.getState().document?.scenarios ?? [];
    const firstCopy = after.find((scenario) => scenario.id === firstCopyId);
    const secondCopy = after.find((scenario) => scenario.id === secondCopyId);
    expect(secondCopy?.devices[0].watts).toBe(333);
    expect(firstCopy?.devices[0].watts).toBe(1200);

    // 两份副本的设备编号互不重叠
    const firstDeviceIds = new Set(firstCopy?.devices.map((device) => device.id));
    expect(secondCopy?.devices.every((device) => !firstDeviceIds.has(device.id))).toBe(true);

    // 两份副本都能正常切换
    vm.selectScenario(firstCopyId);
    expect(vm.activeScenario?.id).toBe(firstCopyId);
    vm.selectScenario(secondCopyId);
    expect(vm.activeScenario?.id).toBe(secondCopyId);
  });

  it('repairs duplicate ids from local data on initialize and persists the fix', () => {
    repository.data.scenarios = [
      { ...structuredClone(exampleScenario), id: 'dup-scenario' },
      { ...structuredClone(exampleScenario), id: 'dup-scenario', name: '另一个方案' },
    ];
    repository.data.activeScenarioId = 'dup-scenario';
    const recovered = new EnergyLensViewModel(repository);
    recovered.initialize();
    const scenarios = recovered.getState().document?.scenarios ?? [];
    expect(new Set(scenarios.map((scenario) => scenario.id)).size).toBe(2);
    expect(recovered.getState().notice?.kind).toBe('info');
    expect(recovered.getState().notice?.text).toContain('重复编号');
    expect(repository.save).toHaveBeenCalled();
    const saved = repository.save.mock.calls.at(-1)?.[0] as EnergyDocument;
    expect(new Set(saved.scenarios.map((scenario) => scenario.id)).size).toBe(2);
    // 各方案内部的设备编号本不重复，不应被误改
    expect(scenarios[0].devices.map((device) => device.id)).toEqual(['device-aircon', 'device-fridge', 'device-lamp']);
  });
});
