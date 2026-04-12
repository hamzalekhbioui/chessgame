import { spawn, ChildProcessWithoutNullStreams } from 'child_process';

export interface EngineEval {
  // Centipawn eval from the side-to-move perspective. Positive = side to move is winning.
  cp: number | null;
  // Mate in N plies from side-to-move perspective (positive = side to move delivers mate)
  mate: number | null;
  bestMove: string; // UCI format, e.g. "e2e4"
  depth: number;
  pv: string[]; // principal variation (UCI moves)
}

/**
 * Wrapper around a Stockfish UCI engine process.
 * Spawns the binary and communicates via stdin/stdout using the UCI protocol.
 */
export class StockfishEngine {
  private process: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';
  private lineHandlers: ((line: string) => void)[] = [];
  private ready = false;

  constructor(private binaryPath: string = process.env.STOCKFISH_PATH || 'stockfish') {}

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(this.binaryPath);
      } catch (err) {
        reject(new Error(`Failed to spawn Stockfish at "${this.binaryPath}": ${(err as Error).message}`));
        return;
      }

      this.process.on('error', (err) => {
        reject(new Error(`Stockfish process error: ${err.message}`));
      });

      this.process.stdout.on('data', (chunk: Buffer) => {
        this.buffer += chunk.toString();
        const lines = this.buffer.split(/\r?\n/);
        this.buffer = lines.pop() || '';
        for (const line of lines) {
          for (const handler of [...this.lineHandlers]) {
            handler(line);
          }
        }
      });

      this.process.stderr.on('data', (chunk: Buffer) => {
        console.error('[stockfish stderr]', chunk.toString());
      });

      // Initialize UCI
      this.send('uci');
      this.waitForLine((l) => l === 'uciok').then(async () => {
        this.send('isready');
        await this.waitForLine((l) => l === 'readyok');
        this.ready = true;
        resolve();
      }).catch(reject);
    });
  }

  private send(cmd: string) {
    if (!this.process) throw new Error('Stockfish not started');
    this.process.stdin.write(cmd + '\n');
  }

  private waitForLine(match: (line: string) => boolean, timeoutMs = 60_000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.lineHandlers = this.lineHandlers.filter((h) => h !== handler);
        reject(new Error('Stockfish line timeout'));
      }, timeoutMs);

      const handler = (line: string) => {
        if (match(line)) {
          clearTimeout(timer);
          this.lineHandlers = this.lineHandlers.filter((h) => h !== handler);
          resolve(line);
        }
      };
      this.lineHandlers.push(handler);
    });
  }

  /**
   * Analyze a position (FEN) to a given depth and return the engine's evaluation.
   * The returned cp/mate are from the side-to-move's perspective.
   */
  async analyze(fen: string, depth: number = 15): Promise<EngineEval> {
    if (!this.ready) throw new Error('Stockfish not ready');

    this.send(`position fen ${fen}`);
    this.send(`go depth ${depth}`);

    let lastCp: number | null = null;
    let lastMate: number | null = null;
    let lastDepth = 0;
    let pv: string[] = [];

    // Collect info lines until bestmove
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.lineHandlers = this.lineHandlers.filter((h) => h !== handler);
        reject(new Error('Stockfish analyze timeout'));
      }, 60_000);

      const handler = (line: string) => {
        if (line.startsWith('info ') && line.includes(' score ')) {
          const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
          const depthMatch = line.match(/depth (\d+)/);
          const pvMatch = line.match(/ pv (.+?)(?:\s(?:bmc|string|$))/);

          if (depthMatch) lastDepth = parseInt(depthMatch[1]);
          if (scoreMatch) {
            const type = scoreMatch[1];
            const value = parseInt(scoreMatch[2]);
            if (type === 'cp') {
              lastCp = value;
              lastMate = null;
            } else {
              lastMate = value;
              lastCp = null;
            }
          }
          if (pvMatch) {
            pv = pvMatch[1].trim().split(/\s+/);
          }
        } else if (line.startsWith('bestmove')) {
          clearTimeout(timer);
          this.lineHandlers = this.lineHandlers.filter((h) => h !== handler);
          const bestMoveMatch = line.match(/bestmove (\S+)/);
          const bestMove = bestMoveMatch ? bestMoveMatch[1] : '';
          resolve({
            cp: lastCp,
            mate: lastMate,
            bestMove: bestMove === '(none)' ? '' : bestMove,
            depth: lastDepth,
            pv,
          });
        }
      };
      this.lineHandlers.push(handler);
    });
  }

  /** Set an option like "Threads" or "Hash" */
  setOption(name: string, value: string | number) {
    this.send(`setoption name ${name} value ${value}`);
  }

  async newGame(): Promise<void> {
    this.send('ucinewgame');
    this.send('isready');
    await this.waitForLine((l) => l === 'readyok');
  }

  async quit(): Promise<void> {
    if (this.process) {
      try {
        this.send('quit');
      } catch {}
      this.process.kill();
      this.process = null;
    }
  }
}
