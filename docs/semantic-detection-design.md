# Semantic Constraint Detection - Design Document

## Problem Statement

Current regex-based pattern matching has significant limitations:

### 1. **False Positives**
- `no-evolutionary-names` flags legitimate test files (e.g., `UserService.test.js`)
- `no-hardcoded-secrets` triggers on mock data or examples
- File naming patterns can't distinguish intent

### 2. **False Negatives**
- Parallel versions with different naming schemes go undetected
- Speculative debugging language varies widely
- Secrets in non-standard formats escape detection

### 3. **Context Blindness**
- Regex can't understand **why** code exists
- Can't distinguish refactoring from duplication
- No understanding of semantic similarity

## Proposed Solution: Hybrid Detection

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Pre-Tool Hook Entry                       │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
         ┌────────────────────────┐
         │  Fast Regex Pre-Filter │ <--- 1-5ms latency
         │  (Eliminate obvious OK) │
         └────────┬───────────────┘
                  │
                  ├─── No Match ──> ✅ Allow
                  │
                  └─── Match ──────┐
                                   ▼
                  ┌──────────────────────────────┐
                  │  Semantic Validation Layer   │ <--- 50-200ms
                  │  (Fast LLM: Haiku/Gemini)    │
                  └────────┬─────────────────────┘
                           │
                           ├─── True Positive ──> 🚫 Block
                           │
                           └─── False Positive ─> ✅ Allow
```

### Detection Levels

#### Level 1: Regex Pre-Filter (Always Run)
- **Latency**: 1-5ms
- **Cost**: $0
- **Purpose**: Fast elimination of non-violations
- **Current constraints remain unchanged**

#### Level 2: Semantic Validation (On Regex Match)
- **Latency**: 50-200ms
- **Cost**: ~$0.0001-0.001 per check
- **Purpose**: Validate true violations vs false positives
- **Models**: Claude Haiku, GPT-4o-mini, Gemini 1.5 Flash

## Constraints Requiring Semantic Analysis

### Critical Priority

1. **no-evolutionary-names** (High false positive rate)
   - **Current issue**: Flags test files, legitimate refactorings
   - **Semantic check**: "Is this creating a parallel version of existing functionality, or is it a test/legitimate refactoring?"
   - **Context needed**: File purpose, existing similar files

2. **no-parallel-files** (Context-dependent)
   - **Current issue**: File naming alone insufficient
   - **Semantic check**: "Is this file duplicating functionality that exists elsewhere?"
   - **Context needed**: File content comparison, purpose analysis

3. **debug-not-speculate** (Language understanding)
   - **Current issue**: Many ways to express uncertainty
   - **Semantic check**: "Is this statement speculating about root cause without evidence?"
   - **Context needed**: Full comment/message context

### Medium Priority

4. **no-hardcoded-secrets** (Pattern variations)
   - **Current issue**: Non-standard formats, encoded secrets
   - **Semantic check**: "Is this a real credential or test/example data?"
   - **Context needed**: Variable names, usage context

5. **proper-error-handling** (Intent understanding)
   - **Current issue**: Some empty catches are intentional
   - **Semantic check**: "Is this empty catch intentional with good reason?"
   - **Context needed**: Surrounding code, comments

6. **plantuml-standard-styling** (Complex validation)
   - **Current issue**: Multiple ways to include styling
   - **Semantic check**: "Does this diagram follow our styling standards?"
   - **Context needed**: Full diagram structure

## Model Selection

### Recommended: Multi-Model Strategy

#### Primary: **Claude Haiku** (Anthropic)
- **Speed**: ~200ms average
- **Cost**: $0.25 per 1M input tokens
- **Strengths**: Best instruction following, safety awareness
- **Use for**: Security-related constraints (secrets, eval)

#### Secondary: **Gemini 1.5 Flash** (Google)
- **Speed**: ~100ms average
- **Cost**: $0.075 per 1M input tokens
- **Strengths**: Fastest, cheapest, good code understanding
- **Use for**: Code structure analysis (evolutionary names, parallel files)

#### Fallback: **GPT-4o-mini** (OpenAI)
- **Speed**: ~150ms average
- **Cost**: $0.15 per 1M input tokens
- **Strengths**: Balanced performance
- **Use for**: General-purpose validation

### Cost Analysis

**Assumptions:**
- Average content size: 500 tokens
- Semantic checks needed: 20% of regex matches
- Daily tool invocations: 1000

**Daily Cost Estimate:**
- Regex matches: 200 (20% of 1000)
- Semantic validations: 200 × $0.0001 = **$0.02/day**
- Monthly: **~$0.60**
- Yearly: **~$7.20**

**Extremely affordable** for the value provided.

## Implementation Design

### 1. Semantic Detector Service

```javascript
class SemanticDetector {
  constructor(config) {
    this.haiku = new AnthropicClient({ model: 'claude-3-haiku-20240307' })
    this.gemini = new GeminiClient({ model: 'gemini-1.5-flash' })
    this.cache = new LRUCache({ max: 1000, ttl: 3600000 }) // 1hr cache
  }

  async validateConstraint(constraintId, context) {
    // Check cache first
    const cacheKey = `${constraintId}:${hash(context)}`
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)

    // Route to appropriate model
    const validator = this.getValidatorForConstraint(constraintId)
    const result = await validator(context)

    this.cache.set(cacheKey, result)
    return result
  }
}
```

### 2. Constraint Configuration Enhancement

```yaml
constraints:
  - id: no-evolutionary-names
    pattern: (?:class|function|const|let|var)\s+\w*(?:V[2-9]|Enhanced)...
    semantic_validation: true  # NEW: Enable semantic check
    semantic_prompt: |
      Analyze this code to determine if it creates a parallel version
      of existing functionality. Consider:
      - Is this a test file? (Allow)
      - Is this legitimate refactoring with new purpose? (Allow)
      - Is this duplicating existing code in a new file? (Block)
    semantic_model: gemini-flash
    semantic_threshold: 0.8  # Confidence threshold
```

### 3. Detection Flow

```javascript
async checkConstraint(constraint, content, filePath) {
  // Level 1: Regex pre-filter
  const regexMatch = content.match(constraint.pattern)
  if (!regexMatch) return { violation: false }

  // Level 2: Semantic validation (if enabled)
  if (constraint.semantic_validation) {
    const context = {
      content,
      filePath,
      matches: regexMatch,
      constraint: constraint.message
    }

    const semanticResult = await this.semanticDetector.validateConstraint(
      constraint.id,
      context
    )

    if (!semanticResult.isViolation) {
      return {
        violation: false,
        reason: semanticResult.reasoning,
        semantic_override: true
      }
    }
  }

  // True violation detected
  return {
    violation: true,
    confidence: semanticResult?.confidence || 1.0
  }
}
```

## Performance Optimization

### 1. Caching Strategy
- **Content hash-based caching**: Same content = cached result
- **TTL**: 1 hour (constraints don't change that often)
- **LRU eviction**: Keep most recent 1000 checks

### 2. Parallel Validation
- Multiple constraints can be validated concurrently
- Use Promise.allSettled for resilience

### 3. Circuit Breaker
- If semantic service is slow (>500ms) or failing
- Fallback to regex-only mode
- Alert operators to investigate

### 4. Smart Routing
- Critical security constraints → Haiku (accuracy)
- Code structure analysis → Gemini (speed/cost)
- Mixed cases → GPT-4o-mini (balance)

## Rollout Plan

### Phase 1: Infrastructure (Week 1)
- [ ] Implement SemanticDetector service
- [ ] Add model clients (Haiku, Gemini, GPT-4o-mini)
- [ ] Build caching layer
- [ ] Add circuit breaker

### Phase 2: Pilot Constraints (Week 2)
- [ ] Enable semantic validation for `no-evolutionary-names`
- [ ] Monitor false positive reduction
- [ ] Measure latency impact
- [ ] Collect feedback

### Phase 3: Expand Coverage (Week 3-4)
- [ ] Add `no-parallel-files` semantic validation
- [ ] Add `debug-not-speculate` semantic validation
- [ ] Add `no-hardcoded-secrets` semantic validation
- [ ] Performance tuning

### Phase 4: Full Production (Week 5+)
- [ ] Enable all semantic validations
- [ ] Dashboard metrics for semantic checks
- [ ] Cost monitoring and alerts
- [ ] Documentation and training

## Success Metrics

### Accuracy Improvements
- **False Positive Rate**: Target <5% (currently ~30%)
- **False Negative Rate**: Target <10% (currently ~15%)
- **User Satisfaction**: Fewer complaints about incorrect blocks

### Performance
- **P50 Latency**: <100ms for semantic checks
- **P99 Latency**: <300ms for semantic checks
- **Cache Hit Rate**: >60% after warm-up

### Cost
- **Monthly Cost**: <$5 for typical usage
- **Cost per Validation**: <$0.001

## Risk Mitigation

### Risk: Model API Downtime
- **Mitigation**: Fallback to regex-only mode
- **Alert**: Notify operators immediately
- **Recovery**: Automatic retry with exponential backoff

### Risk: Cost Overrun
- **Mitigation**: Rate limiting per session
- **Alert**: Warning at 80% of budget
- **Circuit breaker**: Disable semantic at 100% budget

### Risk: Slow Response Times
- **Mitigation**: Aggressive caching
- **Fallback**: Skip semantic after 300ms timeout
- **Optimization**: Model selection based on latency SLA

## Future Enhancements

1. **Local Model Option**: Run small quantized models locally for privacy/speed
2. **Learning System**: Fine-tune models on validated examples
3. **Confidence Scores**: Show users why violations were detected
4. **Interactive Review**: Let users flag false positives to improve prompts
5. **Multi-stage Validation**: Cheap model first, expensive model for edge cases

---

**Status**: ✅ IMPLEMENTED
**Implementation Date**: 2025-10-12
**Commit**: `238bf7f` (submodule), `67850cf` (main)
**Owner**: Constraint Monitoring Team
**Last Updated**: 2025-10-12

## Implementation Summary

The semantic constraint detection system has been successfully implemented with the following components:

### Deployed Components

1. **SemanticValidator** (`src/engines/semantic-validator.js`)
   - Multi-provider support: Groq (llama-3.3-70b, qwen-2.5-32b), Anthropic (Claude Haiku), Gemini (Flash)
   - LRU caching with 1-hour TTL
   - Circuit breaker pattern for fault tolerance
   - Configurable model routing per constraint

2. **ConstraintEngine Integration** (`src/engines/constraint-engine.js`)
   - Two-level detection flow: regex pre-filter → semantic validation
   - **Parallel constraint execution** using `Promise.allSettled` for 3x+ speedup
   - Lazy initialization to minimize startup overhead
   - Graceful fallback to regex-only on semantic service failures

3. **Configuration** (`.constraint-monitor.yaml`)
   - Added `semantic_validation: true` flag for key constraints
   - Enabled for: `no-evolutionary-names`, `no-hardcoded-secrets`, `debug-not-speculate`

### Current Status

- ✅ Infrastructure deployed
- ✅ Pilot constraints enabled
- ⏳ Monitoring performance metrics
- ⏳ Collecting false positive reduction data

### Next Steps

1. Monitor latency and accuracy metrics in production
2. Gradually enable semantic validation for additional constraints
3. Fine-tune model selection and prompts based on real-world performance
4. Implement dashboard metrics for semantic validation statistics
