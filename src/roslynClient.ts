import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { createInterface } from 'readline';

export class RoslynClient {
    private readonly process: ChildProcessWithoutNullStreams;
    private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
    private sequence = 0;
    private closed = false;
    private stderr = '';

    constructor(dll: string, cwd: string) {
        this.process = spawn('dotnet', [dll, '--server'], { cwd, windowsHide: true, shell: false });
        this.process.stderr.on('data', chunk => { this.stderr = (this.stderr + chunk.toString()).slice(-4000); });
        const lines = createInterface({ input: this.process.stdout });
        lines.on('line', line => {
            try {
                const response = JSON.parse(line) as { id: number; error?: string };
                const request = this.pending.get(response.id);
                if (!request) { return; }
                this.pending.delete(response.id); clearTimeout(request.timer);
                if (response.error) { request.reject(new Error(response.error)); } else { request.resolve(response); }
            } catch { this.fail(new Error('Roslyn 응답을 읽을 수 없습니다. 프로젝트를 다시 선택해 주세요.')); }
        });
        this.process.on('error', error => this.fail(new Error(`Roslyn 실행 실패. .NET 10 SDK 설치를 확인해 주세요: ${error.message}`)));
        this.process.on('exit', () => {
            lines.close();
            this.fail(new Error(`Roslyn 분석기가 종료됐습니다. .NET 10 SDK 및 프로젝트 참조를 확인해 주세요. ${this.stderr}`));
        });
        this.process.stdin.on('error', error => this.fail(error));
    }

    request<T>(payload: Record<string, unknown>): Promise<T> {
        if (this.closed) { return Promise.reject(new Error('Roslyn 분석기를 다시 시작하려면 프로젝트를 다시 선택해 주세요.')); }
        const id = ++this.sequence;
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => this.fail(new Error('Roslyn 분석 시간이 초과되었습니다. 프로젝트 참조와 SDK를 확인해 주세요.')), 120_000);
            this.pending.set(id, { resolve: value => resolve(value as T), reject, timer });
            this.process.stdin.write(JSON.stringify({ ...payload, id }) + '\n', error => { if (error) { this.fail(error); } });
        });
    }
    private fail(error: Error) {
        this.closed = true;
        for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); }
        this.pending.clear();
        this.process.kill();
    }
    dispose() { this.fail(new Error('Roslyn 분석이 취소되었습니다.')); }
}
